# Stratum — Execution Plan

## Platform Purpose

A software company building banking applications needs its employees to understand:
1. The **applications** they build and maintain (architecture, APIs, modules, integrations)
2. The **banking domain** they serve (regulations, products, workflows, terminology)
3. The **operational processes** for daily work (SOPs, runbooks, incident playbooks)
4. Their **team's tribal knowledge** (conventions, FAQs, onboarding guides)

## Roles

Two **documentation** roles:

| Role | Description |
|------|-------------|
| **`employee`** | Uses Knowledge Hub and Learning — search, chat, paths, bookmarks |
| **`admin`** | Publishes and governs content, manages users and analytics in Admin Console, can re-index sources |

The deployed API may still store finer-grained role strings (`domain_expert`, `knowledge_admin`, `system_admin`, etc.); those all fall under **admin** in this document.

## Portal Structure

1. **Knowledge Hub** — **employee** and **admin**
2. **Learning** — **employee** and **admin**
3. **Admin Console** — **admin** (content lifecycle, users, analytics, sources)

## Core Features

### Knowledge & Search
- Hybrid RAG: Vector (ChromaDB) + BM25 (Whoosh) → RRF fusion → CrossEncoder reranking
- Banking-domain system prompt with Groq LLM
- Multi-turn conversation history in chatbot
- Source citations on every answer
- Metadata filters (domain, team, system, process)

### Content Management
- Article lifecycle: Draft → In Review → Published → Archived
- Version history for every article
- Domain taxonomy: application / banking / process / tribal
- Expiry tracking for compliance documents
- Pinned articles for critical knowledge

### Learning & Onboarding
- Curated learning paths with ordered items
- Progress tracking per user
- Onboarding paths for new hires
- Difficulty levels: beginner / intermediate / advanced

### Knowledge Analytics
- Query logging for every chat/search
- Knowledge gap detection (unanswered queries grouped and ranked)
- Helpful / not-helpful feedback on RAG answers
- Article status breakdown and expiry alerts

### Expert Directory
- Self-registration as subject matter expert
- Domain, system, and skill tagging
- Availability and contact preference
- Searchable by domain

## Database Schema

10 PostgreSQL tables (e.g. Neon):
- `users` — Auth, profile, expertise tags, last login
- `articles` — Knowledge articles with full lifecycle
- `article_versions` — Version history
- `learning_paths` — Curated paths
- `learning_path_items` — Ordered items in a path
- `user_progress` — Per-user completion state
- `query_logs` — Every query for gap analytics
- `expert_profiles` — Expert directory entries
- `bookmarks` — User-saved articles
- `feedback` — Rating + comment on RAG answers

## RAG Flow

```
PDF → extract → clean → chunk (400 tok, 80 overlap) → embed (all-MiniLM-L6-v2)
→ ChromaDB (vector) + Whoosh (BM25 with metadata)
→ Query → RRF hybrid → CrossEncoder rerank → Guardrails → Groq LLM → Answer + Sources
→ Query log (for gap analytics)
```

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + Pydantic + Groq + ChromaDB + Whoosh + LangGraph (ingestion)
- **Database**: PostgreSQL (e.g. Neon)
- **ML**: SentenceTransformers + BAAI/bge-reranker-base
- **Observability**: Langfuse
- **Frontend**: React 19 + Vite + Tailwind CSS v3
- **Auth**: JWT HS256 + bcrypt
