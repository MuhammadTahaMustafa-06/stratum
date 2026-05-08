# Stratum

> **Knowledge that stacks.** — Internal knowledge mesh for banking software teams. Hybrid RAG, role-aware portals, and a grounded AI copilot built for regulated environments.

Stratum is a production-grade, full-stack RAG-powered internal knowledge platform that helps banking engineers, operators, and compliance teams find authoritative answers from a curated corpus of policies, runbooks, architecture docs, and domain references — with source citations, multi-turn chat, and full audit trails.

---

## Problem Statement

Banking software teams face a knowledge fragmentation crisis:

- **Scattered documentation**: policies live in SharePoint, runbooks in Confluence, architecture diagrams in emails, domain knowledge in people's heads.
- **High onboarding friction**: new engineers spend weeks learning institutional knowledge that should be findable in minutes.
- **Compliance risk**: outdated or misinterpreted policy documents create operational and regulatory exposure.
- **No semantic search**: keyword-based tools miss context; people can't find what they don't know to search for.
- **No accountability**: no record of who accessed what knowledge, no gap analysis for missing content.

**Stratum solves this** by combining a curated knowledge base with hybrid AI retrieval, so every employee gets accurate, cited, role-appropriate answers from a single governed source of truth.

---

## How It Solves the Problem

| Challenge | Stratum Solution |
|-----------|-----------------|
| Scattered docs | Unified KM portal + PDF ingestion pipeline |
| Poor search | Hybrid vector + BM25 + CrossEncoder reranking |
| Stale content | Article lifecycle (Draft → Review → Published → Archived) + version history |
| No AI grounding | Groq LLM with retrieval context + citation enforcement |
| Hallucination risk | Guardrails (input injection check, output PII masking, confidence threshold) |
| No audit trail | Query logs, feedback, analytics, knowledge gap detection |
| Access control | JWT RBAC — employee vs. admin roles with granular portal gates |
| Onboarding friction | Learning paths, expert directory, bookmarks |

---

## Key Features

- **Hybrid RAG Chatbot**: Vector similarity (ChromaDB) + BM25 (Whoosh) → Reciprocal Rank Fusion → CrossEncoder reranking → Groq LLM (`llama-3.3-70b-versatile`) with banking system prompt and source citations
- **Multi-turn Chat**: Full conversation history passed to LLM for contextual follow-ups
- **Article Lifecycle**: Draft → In Review → Published → Archived with full version history
- **Admin PDF Upload**: Upload PDFs directly via admin UI, with pre-ingest quality assessment (pdfplumber heuristics: page count, text density, scan detection)
- **Knowledge Gap Analytics**: Unanswered queries automatically surface as gaps for content creators
- **Bookmarks**: Save and organize articles for quick reference
- **Expert Directory**: Register and discover subject-matter experts by domain and skill
- **Learning Paths**: Curated content sequences with progress tracking
- **MFA / TOTP**: Time-based one-time passwords (pyotp) with QR-code setup, backup codes stored in Postgres
- **Neon Auth Integration**: Google/hosted email sign-in via Neon Auth JWT → Stratum token exchange
- **Document Quality Reports**: Every PDF upload produces a structured quality report (tier: ok / warn / fail) before it enters the index
- **Rate Limiting**: SlowAPI + Redis (production) or in-memory (dev); 200 req/min default
- **Prometheus Metrics**: `/metrics` endpoint for Grafana dashboards (HTTP latency, status codes, scrape health)
- **Langfuse Observability**: LLM tracing, cost tracking, and latency spans per RAG query
- **Dark/Light Theme**: Full theme support across the React SPA

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                              │
│               React 19 + Vite + Tailwind CSS SPA                    │
│   /portal/knowledge  /portal/admin  /login  /mfa  /profile          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS (JWT Bearer / HttpOnly Cookie)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Edge / Reverse Proxy                                │
│              Nginx (host) or Kubernetes Ingress                     │
│         TLS termination  ·  /api/* → backend  ·  /* → frontend      │
└────────────┬──────────────────────────────────────┬─────────────────┘
             │                                      │
             ▼                                      ▼
┌────────────────────────┐             ┌────────────────────────────┐
│  FastAPI Backend v2.0  │             │  React Frontend (Nginx)    │
│  Python 3.11+          │             │  Static SPA on port 8080   │
│                        │             └────────────────────────────┘
│  ┌──────────────────┐  │
│  │  Auth Layer      │  │ ── JWT HS256 + bcrypt + TOTP MFA
│  │  (RBAC / MFA)    │  │ ── Neon Auth exchange endpoint
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │  RAG Pipeline    │  │ ── Guardrails → Hybrid Retrieval
│  │  Service Layer   │  │ ── RRF Fusion → CrossEncoder
│  └──────────────────┘  │ ── Groq LLM → Citations
│  ┌──────────────────┐  │
│  │  Content Service │  │ ── Articles CRUD + versioning
│  │  Analytics       │  │ ── Query logs + feedback + gaps
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │  SlowAPI Limiter │  │ ── Redis (prod) / memory (dev)
│  │  Prometheus      │  │ ── /metrics scrape endpoint
│  └──────────────────┘  │
└────────────┬───────────┘
             │
     ┌───────┼───────────────┬──────────────────┬────────────────┐
     ▼       ▼               ▼                  ▼                ▼
┌─────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐  ┌─────────────┐
│ Neon    │ │ ChromaDB │ │  Whoosh  │  │  Groq API   │  │  Langfuse   │
│Postgres │ │ Vector   │ │  BM25    │  │  LLM Inference│  │  (optional) │
│(primary)│ │  Store   │ │  Index   │  │  llama-3.3  │  │  Tracing    │
└─────────┘ └──────────┘ └──────────┘  └─────────────┘  └─────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend API | FastAPI 0.115+ + Uvicorn | Async HTTP, OpenAPI |
| Primary DB | PostgreSQL via Neon (serverless) | Users, articles, analytics |
| Vector Store | ChromaDB (local persistent) | Semantic similarity search |
| Keyword Index | Whoosh BM25 (rebuilt from Chroma) | Exact-term retrieval |
| Embeddings | `all-MiniLM-L6-v2` (SentenceTransformers) | 384-dim dense vectors |
| Reranker | `BAAI/bge-reranker-base` (CrossEncoder) | Relevance reranking |
| LLM | Groq API — `llama-3.3-70b-versatile` | Answer generation |
| Ingestion | LangGraph pipeline | Extract → clean → chunk → embed |
| Observability | Langfuse + Prometheus + Grafana | Tracing, metrics, dashboards |
| Auth | Stratum JWT (HS256) + bcrypt + pyotp | Password auth, MFA, sessions |
| Frontend | React 19 + Vite 7 + Tailwind CSS v3 | SPA, dark mode |
| Rate Limiting | SlowAPI + Redis | Abuse prevention |
| Containers | Docker + Docker Compose | Local and production deploy |
| Orchestration | Kubernetes + Kustomize | Production scaling |
| Infrastructure | Terraform | Namespace + observability bootstrap |
| CI | GitHub Actions | Lint, test, build, security scan |
| CD | GitHub Actions + SSH deploy | Tag-triggered release |

---

## Portals and Roles

| Role | Access |
|------|--------|
| `employee` | Knowledge Hub, RAG chatbot, search, bookmarks, learning paths, feedback |
| `knowledge_admin` | + Publish/archive articles, upload PDFs, manage KB content |
| `domain_expert` | + Subject-matter expert profile, contribute and review articles |
| `system_admin` | + Full admin console: users CRUD, analytics, query logs, audit events, reindex |

> **Simplified docs view**: `employee` = read/ask access; `admin` = any elevated role above.

---

## API Endpoints (Summary)

Full Swagger docs at `http://localhost:8000/docs` (disabled in production unless `EXPOSE_API_DOCS=true`).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/ping` | Public | Health check |
| POST | `/api/v1/auth/login` | Public | Email/password login; returns JWT + MFA step if enabled |
| POST | `/api/v1/auth/neon/exchange` | Public | Neon Auth token → Stratum JWT |
| POST | `/api/v1/auth/mfa/verify-login` | Public | Complete MFA challenge |
| POST | `/api/v1/auth/refresh` | Cookie | Refresh access token |
| POST | `/api/v1/auth/logout` | Bearer | Invalidate refresh token |
| GET/PUT | `/api/v1/auth/me` | Bearer | Get/update profile |
| POST | `/api/v1/auth/me/avatar` | Bearer | Upload avatar (local disk or S3) |
| POST | `/api/v1/auth/change-password` | Bearer | Change own password |
| POST | `/api/v1/auth/mfa/setup` | Bearer | Begin TOTP enrollment (returns QR URI) |
| POST | `/api/v1/auth/mfa/confirm` | Bearer | Confirm TOTP enrollment |
| POST | `/api/v1/auth/mfa/disable` | Bearer | Disable MFA (requires current TOTP) |
| POST | `/api/v1/chat` | Employee | Multi-turn conversational RAG |
| POST | `/api/v1/ask` | Employee | Single-turn RAG with citations |
| POST | `/api/v1/search` | Employee | Hybrid search (no LLM generation) |
| POST | `/api/v1/feedback` | Employee | Submit answer rating |
| GET | `/api/v1/articles` | Employee | List published articles |
| GET | `/api/v1/articles/{id}` | Employee | Get article by ID |
| GET | `/api/v1/articles/{id}/pdf` | Employee | Download article PDF |
| GET/POST/DELETE | `/api/v1/bookmarks` | Employee | Manage saved articles |
| POST | `/api/v1/articles` | Knowledge Admin | Create article |
| PUT/DELETE | `/api/v1/articles/{id}` | Knowledge Admin | Edit/delete article |
| POST | `/api/v1/articles/{id}/submit-review` | Knowledge Admin | Submit for review |
| POST | `/api/v1/articles/{id}/approve` | Knowledge Admin | Approve and publish |
| POST | `/api/v1/articles/{id}/archive` | Knowledge Admin | Archive article |
| POST | `/api/v1/admin/upload-pdf` | Sources Admin | Upload PDF → quality check → ingest |
| GET | `/api/v1/admin/sources` | Sources Admin | List ingested PDF sources |
| DELETE | `/api/v1/admin/sources/raw/{filename}` | Sources Admin | Remove source file |
| POST | `/api/v1/admin/reindex` | Sources Admin | Trigger full reindex |
| GET/POST | `/api/v1/admin/users` | System Admin | List/create users |
| PATCH | `/api/v1/admin/users/{id}` | System Admin | Update user role/status |
| DELETE | `/api/v1/admin/users/{id}` | System Admin | Delete user |
| GET | `/api/v1/analytics/summary` | Admin | Usage stats, top queries |
| GET | `/api/v1/admin/knowledge-gaps` | Admin | Unanswered query aggregation |
| GET | `/api/v1/admin/query-logs` | Admin | Full query history |
| GET | `/api/v1/admin/audit-events` | Admin | Security and admin event log |
| GET | `/api/v1/admin/feedback` | Admin | All user feedback ratings |
| GET | `/metrics` | Internal | Prometheus metrics scrape |

---

## Database Schema

Schema is auto-created via `Base.metadata.create_all` on startup plus additive `run_light_migrations`.

| Table | Description |
|-------|-------------|
| `users` | Identity, RBAC role, profile, MFA fields, lockout, refresh token hash, `neon_auth_sub` |
| `deleted_users` | Tombstone table — blocks re-registration after admin delete |
| `articles` | KM content: title, body, status, author, source PDF references |
| `article_versions` | Full version history for every article edit |
| `bookmarks` | User ↔ article many-to-many |
| `learning_paths` | Curated content sequences |
| `learning_path_items` | Articles/resources within a learning path |
| `user_progress` | Per-user progress through learning paths |
| `expert_profiles` | Subject-matter expert registry: domain, skills, contact |
| `query_logs` | Every RAG query: user, timestamp, query, answer, answered flag, latency |
| `feedback` | User ratings (thumbs up/down + optional comment) per query |

> **Knowledge gaps** = `query_logs` rows where `answered = false`, aggregated by `ContentService.list_admin_knowledge_gaps`.

---

## RAG Pipeline (Quick Reference)

```
PDF Ingestion
─────────────
  backend/data/raw/*.pdf
       │
       ▼
  LangGraph pipeline (backend/ingestion/)
  ├─ extract.py   — pdfplumber: text + table extraction, page metadata
  ├─ clean.py     — normalize whitespace, strip artifacts
  ├─ chunk.py     — tiktoken 400-token windows, 80-token overlap, table-aware
  ├─ embed.py     — SentenceTransformers all-MiniLM-L6-v2 (384-dim)
  └─ store.py     — ChromaDB (vector) + Whoosh rebuild (BM25)

Query Path
──────────
  User question
       │
       ▼  Input guardrail (injection regex + blocklist)
       ▼  Hybrid retrieval: Chroma dense + Whoosh BM25
       ▼  Reciprocal Rank Fusion (RRF)
       ▼  CrossEncoder reranking (bge-reranker-base, threshold filter)
       ▼  Output guardrail (PII masking)
       ▼  Groq LLM — llama-3.3-70b-versatile (banking system prompt + context)
       ▼  Source citations extracted
       ▼  Query logged (answered=true/false, latency)
  JSON response: answer + sources + latency
```

For full details, gaps, and enhancement roadmap: [docs/RAG_PIPELINE.md](docs/RAG_PIPELINE.md)

---

## Documentation Index

| Area | Document |
|------|----------|
| **This README** | Setup, tech stack, endpoints, schema |
| **How It Works** | [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) — problem statement, product flows, diagrams |
| **System Design** | [docs/system-design.md](docs/system-design.md) — architecture diagrams (Mermaid) |
| **RAG Pipeline** | [docs/RAG_PIPELINE.md](docs/RAG_PIPELINE.md) — pipeline audit, gaps, eval |
| **Document Quality** | [docs/DOCUMENT_QUALITY.md](docs/DOCUMENT_QUALITY.md) — PDF quality checks |
| **Database** | [docs/POSTGRES_DATABASE.md](docs/POSTGRES_DATABASE.md) — Neon setup, schema, MFA |
| **DevOps / CI/CD** | [docs/DEVOPS.md](docs/DEVOPS.md) — full DevOps pipeline |
| **MLOps Lifecycle** | [mlops/README.md](mlops/README.md) — MLOps stages and tooling |
| **AWS EC2 Deploy** | [docs/AWS_EC2_PRODUCTION_GUIDE.md](docs/AWS_EC2_PRODUCTION_GUIDE.md) — production runbook |
| **Docker** | [deploy/docker/README.md](deploy/docker/README.md) — Compose setup |
| **Kubernetes** | [deploy/k8s/README.md](deploy/k8s/README.md) — Kustomize manifests |
| **Terraform** | [infra/terraform/README.md](infra/terraform/README.md) — infra bootstrap |
| **Secrets** | [config/SECRETS.md](config/SECRETS.md) — secret management patterns |
| **Env Templates** | [config/env/README.md](config/env/README.md) — env var reference |
---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL database ([Neon](https://neon.tech) recommended, or any Postgres)
- [Groq API key](https://console.groq.com) (free tier available)
- (Optional) [Langfuse](https://langfuse.com) for LLM observability
- (Optional) Redis for production rate limiting

### 1. Clone and install root tooling

```bash
git clone <repo-url>
cd Bank_RAG_Chatbot
npm install          # installs concurrently for npm run dev
```

### 2. Backend setup

```bash
cd backend
pip install -r requirements.txt

# Copy template and fill in your secrets
cp ../config/env/backend.env.local .env.local
```

Minimum required secrets in `backend/.env.local`:

```env
GROQ_API_KEY=gsk_...
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST.neon.tech/neondb?sslmode=require
JWT_SECRET_KEY=<generate: openssl rand -hex 32>

# Optional — LLM observability
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

See [config/env/README.md](config/env/README.md) and [config/SECRETS.md](config/SECRETS.md) for the full variable reference.

### 3. Frontend setup

```bash
cd frontend
cp ../config/env/frontend.vite.example .env
# Edit .env: set VITE_API_BASE=/api/v1 for local dev
npm install
```

### 4. Run everything (recommended)

From the repository root (backend venv must be active):

```bash
npm run dev
```

This starts:
- FastAPI on `http://127.0.0.1:8000` (with `--reload` watching `app/` and `ingestion/`)
- Vite dev server on `http://localhost:5173` (waits for API to be ready before starting)

Quick health check:
```bash
curl http://127.0.0.1:8000/api/v1/ping
# → {"status":"ok","service":"stratum-api"}
```

Swagger UI: `http://127.0.0.1:8000/docs`

### 5. Ingest documents

Place PDF files in `backend/data/raw/`, then:

```bash
cd backend
python -m ingestion.main
```

The LangGraph pipeline extracts, cleans, chunks (400 tokens, 80 overlap), embeds, and stores to ChromaDB + rebuilds Whoosh BM25 index. File hashes deduplicate re-runs.

### 6. Run tests

```bash
cd backend
pytest tests/ -v --tb=short
```

Tests require a PostgreSQL instance. CI starts Postgres automatically via service container. Locally: use Docker Postgres or a Neon branch, and set `DATABASE_URL` in the test environment.

### 7. Docker (full stack)

```bash
# Requires backend/.env (see deploy/docker/README.md)
docker compose -f deploy/docker/docker-compose.yml up -d --build

# With Prometheus + Grafana:
docker compose -f deploy/docker/docker-compose.yml --profile observability up -d --build
```

### 8. User provisioning

The API does not auto-seed users on startup. Provision via:
- Admin API endpoints (`/admin/users`) after creating the first admin account via direct SQL or bootstrap script
- SQL migration scripts in your deploy workflow
- Neon Auth onboarding flow (email/Google)

---

## Security

- **RBAC**: all API dependencies enforce role gates; portal routes are gated in both API and SPA
- **No SQLite in production**: PostgreSQL only
- **JWT secrets** never in Git: use K8s Secrets, AWS Secrets Manager, or vault
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, `HSTS` (production only)
- **Request size limit**: configurable `MAX_REQUEST_SIZE_MB` (default 50 MB)
- **Rate limiting**: SlowAPI (200 req/min default); Redis-backed in production
- **PII masking**: output guardrail strips phone numbers, emails, card numbers from LLM responses
- **Injection prevention**: input guardrail blocks known prompt-injection patterns
- **OpenAPI disabled in production** unless `EXPOSE_API_DOCS=true`
- **gitleaks** in CI: blocks commits containing secrets

---

## Contributing

1. Branch from `main`
2. Run `ruff check` + `mypy` + `bandit` before pushing (CI enforces all three)
3. Add/update tests in `backend/tests/`
4. Update docs in `docs/` for any behaviour changes
5. Create PR — CI runs full pipeline; deploy on tag `vX.Y.Z`
