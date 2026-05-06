# Stratum — system design

Stratum is an internal **knowledge management + RAG** platform: employees search curated articles and PDFs, query an LLM with retrieval, and authenticate via email/password and optional MFA (Stratum-issued JWTs).

## High-level architecture

```mermaid
flowchart TB
  subgraph Clients
    SPA[React SPA]
  end

  subgraph Edge
    ING[Ingress / Nginx]
  end

  subgraph Kubernetes_stratum["Kubernetes — stratum namespace"]
    FE[Frontend pods — static + nginx]
    API[FastAPI backend]
    API --> DB[(PostgreSQL e.g. Neon)]
    API --> CH[(ChromaDB)]
    API --> WH[(Whoosh BM25)]
    API --> LLM[Groq LLM API]
    API --> LF[Langfuse optional]
  end

  subgraph Observability["Kubernetes — observability namespace"]
    PROM[Prometheus]
    GRAF[Grafana]
    PROM --> GRAF
  end

  SPA --> ING
  ING --> FE
  ING --> API
  API -->|"/metrics"| PROM
  SPA -.->|Bearer JWT after /auth/login| API
```

## Request path (RAG chat)

```mermaid
sequenceDiagram
  participant U as User
  participant F as SPA
  participant A as API
  participant R as Retriever
  participant L as LLM

  U->>F: Ask question
  F->>A: POST /ask or /chat (Bearer JWT)
  A->>R: Hybrid vector + BM25 + rerank
  R-->>A: Top chunks + metadata
  A->>L: Guardrailed prompt + context
  L-->>A: Answer
  A-->>F: JSON answer + sources
  F-->>U: Render + citations
```

## DevOps / MLOps flow

```mermaid
flowchart LR
  subgraph Dev
    CODE[Git push]
    TEST[pytest + ruff]
    FE[npm build]
  end

  subgraph CI["GitHub Actions / Jenkins"]
    CODE --> TEST
    CODE --> FE
    TEST --> IMG[Docker build]
    FE --> IMG
  end

  subgraph CD
    IMG --> REG[Container registry]
    REG --> K8S[kubectl / GitOps]
    K8S --> MON[Prometheus scrape]
  end

  subgraph MLOps
    DATA[Ingestion pipeline]
    EMB[Embeddings refresh]
    DATA --> EMB
    EMB --> K8S
  end
```

## Security boundaries

- **RBAC** enforced in API dependencies; portal routes gated by role.
- **Primary database** is **PostgreSQL** (e.g. Neon) only (no SQLite in production paths).
- **Secrets** never in Git: use K8s Secrets + External Secrets / vault (see `config/SECRETS.md`).
- **CSP** on SPA; API returns security headers (see `app/main.py`).
- **OpenAPI / Swagger** are served in non-production environments for developer discovery (`/docs`, `/redoc`).

## Scaling notes

- **API**: horizontal scale behind Ingress; shared DB and vector store (move Chroma to managed vector DB for multi-replica consistency).
- **Embeddings**: batch ingestion jobs (CronJob) after PDF upload; consider **DVC** + object storage for training datasets if you add custom rankers (see `mlops/README.md`).
