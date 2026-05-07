# Stratum documentation index

Start with the [project README](../README.md) for setup and demos; use this page to navigate deeper docs.

## Getting started

| Topic | Document |
|--------|-----------|
| Clone → backend + frontend → env files → run | [README.md](../README.md) |
| Environment variables (backend + frontend, pytest, production patterns) | [config/SECRETS.md](../config/SECRETS.md) |
| Committed templates (`backend.env.local`, `backend.env.prod`, `frontend.vite.example`) | [config/env/README.md](../config/env/README.md) |
| PostgreSQL (e.g. Neon): URI, tables on boot, auth/MFA model | [POSTGRES_DATABASE.md](./POSTGRES_DATABASE.md) |

## Architecture & design

| Topic | Document |
|--------|-----------|
| End-to-end architecture, diagrams (stack, RAG flow, CI/CD) | [system-design.md](./system-design.md) |
| Employee KM execution / portals narrative (two doc roles: employee · admin) | [employee_km_execution.md](./employee_km_execution.md) |

## RAG & content quality

| Topic | Document |
|--------|-----------|
| Pipeline audit, gaps, eval tooling path | [RAG_PIPELINE.md](./RAG_PIPELINE.md) |
| PDF quality checks, evaluation mindset | [DOCUMENT_QUALITY.md](./DOCUMENT_QUALITY.md) |

Offline eval (from `backend/`): `python tools/evaluate_rag.py` (requires `GROQ_API_KEY` and corpus).

## Operations & deployment

| Topic | Document |
|--------|-----------|
| CI/CD (GitHub Actions, Jenkins), Compose path, observability, links | [DEVOPS.md](./DEVOPS.md) |
| Docker Compose (API + SPA, observability profile) | [deploy/docker/README.md](../deploy/docker/README.md) |
| Kubernetes (Kustomize, secrets, applies) | [deploy/k8s/README.md](../deploy/k8s/README.md) |
| Terraform (namespaces, optional kube-prometheus-stack) | [infra/terraform/README.md](../infra/terraform/README.md) |
| Production deploy workflow (tag builds, registry) | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) |

## MLOps & observability

| Topic | Document |
|--------|-----------|
| ML lifecycle alignment with DevOps | [mlops/README.md](../mlops/README.md) |
| Prometheus / Grafana compose configs | `observability/docker/` |

## API discovery

| Environment | URL |
|-------------|-----|
| Local (when `ENVIRONMENT` ≠ `production`) | Swagger: `http://127.0.0.1:8000/docs`, ReDoc: `/redoc`, OpenAPI: `/openapi.json` |
| Production | Disabled unless `EXPOSE_API_DOCS=true` |

## Conventions

- **Database:** PostgreSQL (`DATABASE_URL`), e.g. Neon. SQLite is not supported.
- **Secrets:** Never commit `backend/.env`, `backend/.env.local`, or `frontend/.env`.
- **Paths:** Chroma under `backend/data/chroma_db`, Whoosh under `backend/data/whoosh_index` by default.
