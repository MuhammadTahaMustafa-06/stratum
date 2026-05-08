# Stratum — System Design

Stratum is an internal **knowledge management + hybrid RAG** platform for banking software teams. Employees search curated articles and PDFs, query an LLM with retrieval-augmented context, and authenticate via email/password with optional TOTP MFA — all backed by role-aware access controls and a full audit trail.

---

## 1. High-Level Architecture

```mermaid
flowchart TB
  subgraph Clients["Client Layer"]
    SPA["React 19 SPA\n(Vite + Tailwind CSS)"]
  end

  subgraph Edge["Edge / Ingress"]
    NGINX["Nginx Reverse Proxy\nTLS Termination\n/api/* → backend\n/* → frontend"]
  end

  subgraph Backend["Backend (FastAPI v2.0 — Python 3.11+)"]
    direction TB
    AUTH["Auth Layer\nJWT HS256 · bcrypt · TOTP MFA\nNeon Auth exchange"]
    RBAC["RBAC Middleware\nemployee · knowledge_admin\ndomain_expert · system_admin"]
    RAG["RAG Pipeline\nGuardrails → Retrieval → RRF\nCrossEncoder → Groq LLM"]
    CONTENT["Content Service\nArticles · Versioning\nBookmarks · Feedback"]
    ANALYTICS["Analytics Service\nQuery Logs · Gaps · Audit"]
    RATE["Rate Limiting\nSlowAPI + Redis\n200 req/min"]
    METRICS["Prometheus Metrics\n/metrics endpoint"]
  end

  subgraph DataStores["Data Stores"]
    PG["PostgreSQL\n(Neon Serverless)\nUsers · Articles · Analytics"]
    CHROMA["ChromaDB\nVector Store\nall-MiniLM-L6-v2 embeddings"]
    WHOOSH["Whoosh BM25\nKeyword Index\nRebuilt from Chroma"]
  end

  subgraph ExternalServices["External Services"]
    GROQ["Groq API\nllama-3.3-70b-versatile\nLLM Generation"]
    LF["Langfuse\n(Optional)\nLLM Tracing + Cost"]
    NEON_AUTH["Neon Auth\n(Optional)\nGoogle / Email SSO"]
    S3["AWS S3\n(Optional)\nAvatar Storage"]
  end

  subgraph Observability["Observability Stack"]
    PROM["Prometheus\nMetrics Collector"]
    GRAF["Grafana\nDashboards"]
    PROM --> GRAF
  end

  SPA -->|HTTPS + Bearer JWT| NGINX
  NGINX --> SPA_STATIC["Frontend Container\nnginx:alpine\nport 8080"]
  NGINX -->|/api/*| Backend

  Backend --> AUTH
  AUTH --> RBAC
  RBAC --> RAG
  RBAC --> CONTENT
  RBAC --> ANALYTICS

  RAG --> CHROMA
  RAG --> WHOOSH
  RAG --> GROQ
  RAG --> LF
  CONTENT --> PG
  AUTH --> PG
  AUTH --> NEON_AUTH
  ANALYTICS --> PG
  RATE --> REDIS["Redis\nRate limit storage"]
  Backend -->|"/metrics"| PROM
  CONTENT --> S3
```

---

## 2. Request Path — RAG Chat / Ask

```mermaid
sequenceDiagram
  actor U as User
  participant SPA as React SPA
  participant API as FastAPI Backend
  participant GRD as Guardrails
  participant RET as Retrieval Service
  participant RRF as RRF Fusion
  participant CRS as CrossEncoder
  participant LLM as Groq LLM
  participant LOG as Query Logger

  U->>SPA: Types question
  SPA->>API: POST /api/v1/chat or /ask\n(Bearer JWT + conversation history)
  API->>API: RBAC check (require_knowledge_access)
  API->>GRD: Input guardrail\n(injection regex · blocklist)
  GRD-->>API: Cleared or rejected (400)

  par Hybrid Retrieval
    API->>RET: Vector search (Chroma)\ntop_k dense neighbours
    API->>RET: BM25 search (Whoosh)\ntop_k keyword matches
  end

  RET-->>RRF: Dense docs + BM25 docs
  RRF-->>API: RRF-fused ranked list

  API->>CRS: CrossEncoder reranking\n(bge-reranker-base, max_length=512)
  CRS-->>API: Reranked + threshold-filtered chunks

  API->>GRD: Output guardrail\n(PII masking · confidence threshold)
  API->>LLM: Prompt: system context + retrieved chunks\n+ conversation history
  LLM-->>API: Generated answer

  API->>LOG: Log query (user, text, answered, latency)
  API-->>SPA: JSON { answer, sources, latency_ms }
  SPA-->>U: Renders answer + source citations
```

---

## 3. Ingestion Pipeline

```mermaid
flowchart LR
  subgraph Sources
    PDF["PDF Files\nbackend/data/raw/*.pdf"]
    UPLOAD["Admin Upload\nPOST /admin/upload-pdf"]
  end

  subgraph QualityCheck["Quality Check (upload only)"]
    QC["assess_pdf_for_rag\npdfplumber heuristics\ntier: ok / warn / fail"]
  end

  subgraph LangGraphPipeline["LangGraph Ingestion Pipeline\n(backend/ingestion/)"]
    EXTRACT["extract.py\npdfplumber\ntext + tables + metadata"]
    CLEAN["clean.py\nnormalize whitespace\nstrip artifacts"]
    CHUNK["chunk.py\ntiktoken chunking\n400 tokens · 80 overlap\ntable-aware splits"]
    EMBED["embed.py\nSentenceTransformers\nall-MiniLM-L6-v2\n384-dim vectors"]
    STORE["store.py\nwrite to ChromaDB\nrebuild Whoosh BM25"]
  end

  subgraph Indexes
    CHROMA["ChromaDB\nVector Store"]
    WHOOSH["Whoosh\nBM25 Index"]
  end

  PDF --> EXTRACT
  UPLOAD --> QC
  QC -->|tier != fail| EXTRACT
  EXTRACT --> CLEAN
  CLEAN --> CHUNK
  CHUNK --> EMBED
  EMBED --> STORE
  STORE --> CHROMA
  STORE --> WHOOSH

  style QualityCheck fill:#f5f5f5,stroke:#999
```

---

## 4. Authentication and Session Flow

```mermaid
sequenceDiagram
  actor U as User
  participant SPA as React SPA
  participant API as FastAPI
  participant PG as PostgreSQL (Neon)

  alt Email / Password login
    U->>SPA: Enter email + password
    SPA->>API: POST /auth/login
    API->>PG: Fetch user, verify bcrypt hash
    PG-->>API: User record
    alt MFA enabled
      API-->>SPA: { mfa_required: true, temp_token }
      U->>SPA: Enter TOTP code
      SPA->>API: POST /auth/mfa/verify-login
      API->>PG: Verify TOTP via pyotp
    end
    API-->>SPA: access_token + HttpOnly refresh cookie
  end

  alt Google / Neon Auth SSO
    U->>SPA: Click "Sign in with Google"
    SPA->>NEON["Neon Auth"]: OAuth flow
    NEON-->>SPA: Neon access token
    SPA->>API: POST /auth/neon/exchange\n(Neon token in body)
    API->>NEON: Verify Neon JWT
    API->>PG: Upsert user (neon_auth_sub)
    API-->>SPA: Stratum access_token + refresh cookie
  end

  SPA->>API: Authenticated requests\nAuthorization: Bearer <access_token>
  API->>API: Verify JWT signature\nExtract role claims
  API-->>SPA: Response

  Note over SPA,API: Token refresh via POST /auth/refresh\nusing HttpOnly cookie (no JS access)
```

---

## 5. Article Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Draft : Author creates article
  Draft --> InReview : submit-review (knowledge_admin)
  InReview --> Draft : Request changes
  InReview --> Published : approve (knowledge_admin / domain_expert)
  Published --> Archived : archive (knowledge_admin / system_admin)
  Archived --> Published : unarchive
  Published --> InReview : Re-edit (creates new version)

  Draft : Draft\nOnly visible to author + admins
  InReview : In Review\nPending approval
  Published : Published\nVisible to all employees
  Archived : Archived\nHidden from search; version retained
```

---

## 6. RBAC and Portal Access Matrix

```mermaid
flowchart LR
  subgraph Roles
    E["employee"]
    KA["knowledge_admin"]
    DE["domain_expert"]
    SA["system_admin"]
  end

  subgraph Portals
    KH["Knowledge Hub\n/portal/knowledge\n• Search + Browse\n• RAG Chat/Ask\n• Bookmarks\n• Feedback"]
    LP["Learning Paths\n/portal/knowledge\n• Curated sequences\n• Progress tracking"]
    AC["Admin Console\n/portal/admin\n• Users CRUD\n• Analytics\n• Query Logs\n• Audit Events"]
    KB["KB Management\n• Create/Edit articles\n• Upload PDFs\n• Reindex\n• Review workflow"]
  end

  E --> KH
  E --> LP
  KA --> KH
  KA --> LP
  KA --> KB
  DE --> KH
  DE --> LP
  DE --> KB
  SA --> KH
  SA --> LP
  SA --> KB
  SA --> AC
```

---

## 7. Deployment Topology (Production — Docker Compose on EC2)

```mermaid
flowchart TB
  subgraph Internet
    USER["End Users\n(Browser)"]
    GH["GitHub Actions\nCI/CD"]
    GHCR["GHCR\nContainer Registry"]
  end

  subgraph EC2["AWS EC2 (Ubuntu 24.04)"]
    direction TB
    HOSTNG["Host Nginx\nTLS termination\nLet's Encrypt\nport 80/443"]

    subgraph DockerCompose["Docker Compose (deploy/docker/)"]
      FE_C["frontend\nnginx:alpine\nport 8080\nReact SPA"]
      BE_C["backend\nPython 3.11\nFastAPI + Uvicorn\nport 8000"]
      REDIS_C["redis\nRedis 7\nRate limit store"]
      subgraph ObsProfile["--profile observability"]
        PROM_C["prometheus\nport 9090"]
        GRAF_C["grafana\nport 3000"]
      end
    end

    VOL["/opt/stratum\nbackend/.env\ndata/ volume\n(Chroma + Whoosh)"]
  end

  subgraph ExternalManaged["External Managed Services"]
    NEON_DB["Neon PostgreSQL\nServerless\npooled connection"]
    GROQ_API["Groq API\nLLM Inference"]
    LF_CLOUD["Langfuse Cloud\n(optional tracing)"]
    S3_AWS["AWS S3\nAvatar storage"]
  end

  USER -->|HTTPS| HOSTNG
  HOSTNG -->|port 8080| FE_C
  HOSTNG -->|/api/* port 8000| BE_C
  BE_C --> REDIS_C
  BE_C --> NEON_DB
  BE_C --> GROQ_API
  BE_C --> LF_CLOUD
  BE_C --> S3_AWS
  BE_C -->|/metrics| PROM_C
  PROM_C --> GRAF_C
  GH -->|SSH deploy.sh| EC2
  GH -->|docker push| GHCR
  GHCR -->|docker pull| EC2
  VOL -.-> BE_C
```

---

## 8. Kubernetes Deployment Topology

```mermaid
flowchart TB
  subgraph KubeCluster["Kubernetes Cluster"]
    subgraph StratumNS["stratum namespace"]
      ING["Ingress\nnginx-ingress\nTLS + routing"]
      FE_POD["frontend Pod(s)\nnginx:alpine\nHPA"]
      BE_POD["backend Pod(s)\nFastAPI + Uvicorn\nHPA"]
      FE_SVC["frontend Service\nClusterIP :80"]
      BE_SVC["backend Service\nClusterIP :8000"]
      CM["ConfigMap\nApp config"]
      SEC["Secret\nstratum-backend-secrets\nDATABASE_URL\nJWT_SECRET_KEY\nGROQ_API_KEY"]
    end

    subgraph ObsNS["observability namespace"]
      PROM_K["Prometheus\nkube-prometheus-stack"]
      GRAF_K["Grafana\nDashboards"]
    end
  end

  ING --> FE_SVC
  ING --> BE_SVC
  FE_SVC --> FE_POD
  BE_SVC --> BE_POD
  BE_POD --> SEC
  BE_POD --> CM
  BE_POD -->|/metrics| PROM_K
  PROM_K --> GRAF_K
  TF["Terraform\ninfra/terraform/"] -->|namespace + helm| ObsNS
  KUST["Kustomize\ndeploy/k8s/overlays/production"] --> StratumNS
```

---

## 9. Security Boundaries

| Boundary | Mechanism |
|----------|-----------|
| Transport | HTTPS everywhere; HSTS in production |
| Identity | JWT HS256 (access 15min) + HttpOnly refresh cookie (7 days) |
| Authorization | RBAC middleware on every API dependency |
| Input safety | Injection regex + blocklist guardrail before RAG |
| Output safety | PII masking (phone/email/card) + confidence threshold |
| Request size | `MAX_REQUEST_SIZE_MB` enforced in middleware |
| Rate limiting | SlowAPI 200 req/min; Redis-backed in production |
| Secrets | Never in Git; K8s Secrets + env files on host |
| API docs | Disabled in `ENVIRONMENT=production` by default |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Container scanning | Trivy CRITICAL-level scan in CI on every main push |
| Secret scanning | gitleaks in CI on every push |

---

## 10. Scaling Notes

- **Backend**: horizontal scale behind Ingress; shared Postgres and Groq API are already multi-tenant-safe. ChromaDB and Whoosh are **local-disk stores** — for multi-replica backends, migrate to a managed vector DB (Pinecone, Weaviate, pgvector) or use a shared PVC (read-only replicas OK for retrieval).
- **Embeddings**: the SentenceTransformer and CrossEncoder are loaded **once per process** as singletons (`app/services/rag_providers.py`). Each backend replica carries its own model copy. If memory is a constraint, extract to a dedicated inference service.
- **Ingestion**: run as a CronJob or manual admin trigger (`POST /admin/reindex`), not as a hot path. Consider DVC or LakeFS for corpus versioning under compliance requirements.
- **Rate limiting**: in-process `memory://` is safe for single-replica dev; **always use Redis in production** (required and enforced by startup validation when `ENVIRONMENT=production`).
