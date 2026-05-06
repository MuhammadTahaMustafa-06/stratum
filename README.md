# Stratum

> **Knowledge that stacks.** Internal knowledge mesh for banking software teams — hybrid RAG, role-aware portals, and a grounded copilot.

A full-stack RAG-powered platform that helps engineers and operators understand the banking applications they build and the domain they serve. Built on FastAPI, React 19, ChromaDB, PostgreSQL (e.g. Neon), and Groq.

---

## What It Does

Stratum gives internal employees a single source of truth for:

- **Banking domain knowledge** — regulations, products, terminology, KYC/AML references
- **Application understanding** — system architecture, APIs, modules, configuration guides
- **Operational runbooks** — SOPs, incident playbooks, escalation guides
- **Team knowledge** — onboarding guides, FAQs, team conventions
- **AI-powered answers** — hybrid RAG chatbot with source citations and multi-turn conversation

---

## Portals & Roles

Stratum uses **two documentation roles**: **`employee`** and **`admin`**.

| Role | What they do |
|------|----------------|
| **`employee`** | Search, browse, RAG chatbot, learning paths, bookmarks, feedback — day-to-day consumers of knowledge. |
| **`admin`** | Everything **employees** can do, plus publish and govern content, open **Admin Console** (users, analytics, sources, re-index), and manage the knowledge base. |

| Portal | Who |
|--------|-----|
| Knowledge Hub, Learning | **employee** and **admin** |
| Admin Console | **admin** |

*Implementation note:* The API still persists **granular** role strings (`employee`, `domain_expert`, `knowledge_admin`, `system_admin`) for RBAC and seeded demos. In docs, **admin** maps to any of the non-employee roles above.

---

## Architecture

```
frontend/          React 19 + Vite + Tailwind CSS
backend/
  app/
    api/           FastAPI routers (auth, knowledge, admin)
    models/        SQLAlchemy ORM models
    schemas/       Pydantic request/response schemas
    services/      Content, Retrieval, LLM, Guardrails, Monitoring
    auth/          RBAC roles & portal access matrix
    core/          Config (settings) + security (JWT/bcrypt)
    db/            SQLAlchemy session + ChromaDB client
  ingestion/       LangGraph PDF ingestion pipeline
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn |
| Primary DB | PostgreSQL (e.g. [Neon](https://neon.tech)) |
| Vector Store | ChromaDB (local persistent) |
| Keyword Index | Whoosh BM25 (rebuilt from ChromaDB on ingestion) |
| Embeddings | SentenceTransformers `all-MiniLM-L6-v2` |
| Reranker | `BAAI/bge-reranker-base` CrossEncoder |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| Observability | Langfuse |
| Frontend | React 19 + Vite + Tailwind CSS v3 |
| Auth | Stratum JWT (HS256) + bcrypt; email/password and MFA in the API database |

---

## Documentation

| Area | Where |
|------|--------|
| **Index of all docs** | [docs/README.md](docs/README.md) |
| Configuration & secrets | [config/SECRETS.md](config/SECRETS.md), [config/env/README.md](config/env/README.md) |
| Architecture & diagrams | [docs/system-design.md](docs/system-design.md) |
| RAG pipeline & eval | [docs/RAG_PIPELINE.md](docs/RAG_PIPELINE.md), [docs/DOCUMENT_QUALITY.md](docs/DOCUMENT_QUALITY.md) |
| CI/CD, Docker, K8s | [docs/DEVOPS.md](docs/DEVOPS.md), [deploy/docker/README.md](deploy/docker/README.md), [deploy/k8s/README.md](deploy/k8s/README.md) |
| Terraform / observability bootstrap | [infra/terraform/README.md](infra/terraform/README.md) |

---

## Setup

### 1. Prerequisites

- Python 3.11+
- Node.js 20+
- A **PostgreSQL** database ([Neon](https://neon.tech) or any Postgres; copy URI into `DATABASE_URL`)
- A [Groq API key](https://console.groq.com)
- **PostgreSQL for pytest** — local Docker, CI provides Postgres automatically; or point `DATABASE_URL` at a dev instance (see `config/SECRETS.md`)
- (Optional) [Langfuse](https://langfuse.com) for LLM observability

### 2. Backend

```bash
cd backend
# Runtime dependencies
pip install -r requirements.txt

# Create backend/.env from template: copy config/env/backend.env.local → backend/.env (see config/env/README.md)
```

Edit `backend/.env` (use your own hosts and keys — never commit real secrets). Minimum for local API + RAG:

```env
# LLM
GROQ_API_KEY=gsk_...

# Database — e.g. Neon (use postgresql+psycopg2:// in SQLAlchemy)
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST.neon.tech/neondb?sslmode=require

# Auth (generate with: openssl rand -hex 32)
JWT_SECRET_KEY=your-secure-secret-key-here

# Optional: Langfuse observability
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

```

Start the API server (reloads on Python changes under `app/` and `ingestion/` only; avoids noisy reloads from `data/`):

```bash
cd backend
python -m uvicorn app.main:app --reload --reload-delay 0.75 --reload-dir app --reload-dir ingestion --host 127.0.0.1 --port 8000
```

**If you see `ModuleNotFoundError: No module named 'app'`:** you ran uvicorn from the wrong folder (for example `frontend/`). The Python package is `backend/app` — always run commands from `backend/`, or use **`npm run dev`** from the repo root (starts API + Vite).

**Both servers with one command** (from repo root — activate your backend `venv` first so `python` has FastAPI/uvicorn):

```bash
npm install
npm run dev
```

Runs the API on `http://127.0.0.1:8000` and Vite on `http://localhost:5173` with HMR; stops both with Ctrl+C once (`-k`). Vite waits until `GET /api/v1/ping` succeeds before starting, so you avoid proxy **ECONNREFUSED** while the API worker is still importing (common with `--reload` on Windows).

If you start **`npm run dev` only inside `frontend/`**, run the API in another terminal first and wait until it finishes startup (or you may see **ECONNREFUSED** until port 8000 is listening).

**Quick checks:** API — open `http://127.0.0.1:8000/docs` or `curl http://127.0.0.1:8000/api/v1/ping` (expect `{"status":"ok","service":"stratum-api"}`). SPA — open `http://localhost:5173` (Vite). The browser calls the API via the Vite dev proxy at `/api/v1` (see `frontend/vite.config.js`); ensure `VITE_API_BASE` in `frontend/.env.local` is `/api/v1` for local dev unless you know you need a full URL.

**Backend tests** (`pytest` in `backend/`) need a PostgreSQL instance (same engine as production). Use a local Docker Postgres or Neon branch; CI starts Postgres automatically. See `config/SECRETS.md` for the test URL pattern. Tests live in `backend/tests/` (`test_health`, `test_auth`, `test_validation_errors`, `test_document_quality`); `conftest.py` seeds env vars and provides fixtures (`client`, `login_credentials`, `seeded_employee`, `auth_headers`). Do not name fixtures `pytest_*` — pytest treats them as hook stubs.

```bash
cd backend
pytest tests/ -v --tb=short
```

### 3. Ingest Documents

Put PDF files in `backend/data/raw/`, then run:

```bash
cd backend
python -m ingestion.main
```

The pipeline: extracts text/tables → cleans → chunks (400 tokens, 80 overlap) → embeds → stores in ChromaDB → rebuilds Whoosh BM25 index.

### 4. Frontend

```bash
cd frontend
# Copy config/env/frontend.env.local → .env.local, then edit (see config/env/README.md)
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

**API must be up for login and RAG:** `npm run dev` **inside `frontend/`** starts **only Vite**. The dev proxy forwards `/api/v1/*` to `http://127.0.0.1:8000`; if nothing listens there you get `ECONNREFUSED`. Either start the API in another terminal (`cd backend` then the uvicorn command from section 2), or from the **repository root** run **`npm run dev`** once — that starts API + Vite together (requires `npm install` at the root for `concurrently`).

**Auth:** The SPA signs in with **email/password** against the API; MFA applies when enabled on the account. Users live in the PostgreSQL database (`users` table).

### 5. Docker (API + frontend)

From the repository root (requires `backend/.env` — see [deploy/docker/README.md](deploy/docker/README.md)):

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Optional Prometheus + Grafana: add `--profile observability` to the same command.

### 6. User provisioning

The API no longer auto-seeds users or sample knowledge on startup. Provision users through admin APIs, SQL migration/bootstrap scripts, or your identity onboarding flow.

See **`docs/POSTGRES_DATABASE.md`** for database setup and auth model details.

---

## RAG pipeline and quality

- Pipeline audit and known gaps: [docs/RAG_PIPELINE.md](docs/RAG_PIPELINE.md)
- Document quality / OSS tooling: [docs/DOCUMENT_QUALITY.md](docs/DOCUMENT_QUALITY.md)

```
PDF Documents
    ↓ pdfplumber (text + table extraction)
    ↓ Clean & normalise
    ↓ tiktoken chunking (400 tokens, 80 overlap, table-aware)
    ↓ SentenceTransformers embedding (all-MiniLM-L6-v2, 384-dim)
    ↓ ChromaDB vector store + Whoosh BM25 index (with metadata)
    ↓
Query
    ↓ Input guardrail (blocklist check)
    ↓ Hybrid retrieval (vector + BM25 → Reciprocal Rank Fusion)
    ↓ CrossEncoder reranking (BAAI/bge-reranker-base)
    ↓ Output guardrail (score threshold + PII masking)
    ↓ Groq LLM generation (with conversation history + banking system prompt)
    ↓ Source citations
    ↓ Query logging (for gap analytics)
```

---

## Key Features

- **Hybrid Search**: Vector similarity + BM25 keyword → RRF fusion → CrossEncoder reranking
- **Multi-turn Chat**: Conversation history passed to LLM for contextual answers
- **Source Citations**: Every answer links back to source documents
- **Learning Paths**: Curated content sequences with progress tracking
- **Expert Directory**: Register/find subject matter experts by domain and skill
- **Knowledge Gap Analytics**: Track unanswered queries to guide content creation
- **Article Lifecycle**: Draft → In Review → Published → Archived with version history
- **Bookmarks**: Save articles for later reference
- **Dark Mode**: Full dark/light theme support

---

## API Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/auth/me` | Bearer token |
| POST | `/api/v1/chat` | Employee |
| POST | `/api/v1/ask` | Employee |
| POST | `/api/v1/search` | Employee |
| GET/POST | `/api/v1/articles` | Employee |
| GET/POST/DELETE | `/api/v1/bookmarks` | Employee |
| POST | `/api/v1/feedback` | Employee |
| GET | `/api/v1/admin/sources` | Admin |
| POST | `/api/v1/admin/reindex` | Admin |
| GET/POST | `/api/v1/admin/users` | Admin |
| GET | `/api/v1/analytics/summary` | Admin |

API docs (Swagger) at `http://localhost:8000/docs` whenever `ENVIRONMENT` is not `production` (ReDoc: `/redoc`, OpenAPI: `/openapi.json`).
