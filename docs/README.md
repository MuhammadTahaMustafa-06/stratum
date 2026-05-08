# Stratum — Documentation Index

Start with the [project README](../README.md) for setup and overview; use this page to navigate deeper documentation.

---

## Getting Started

| Topic | Document |
|-------|----------|
| Clone → backend + frontend → env files → run | [README.md](../README.md) |
| Environment variables (backend + frontend, pytest, production patterns) | [config/SECRETS.md](../config/SECRETS.md) |
| Committed env templates (`backend.env.local`, `backend.env.prod`, `frontend.vite.example`) | [config/env/README.md](../config/env/README.md) |
| PostgreSQL (e.g. Neon): URI, tables on boot, auth/MFA model | [POSTGRES_DATABASE.md](./POSTGRES_DATABASE.md) |

---

## Product Understanding

| Topic | Document |
|-------|----------|
| **Problem statement, how Stratum solves it, product flows** | [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) |

---

## Architecture and Design

| Topic | Document |
|-------|----------|
| Full architecture diagrams: system, request path, ingestion, auth, RBAC, deployments | [system-design.md](./system-design.md) |
| Article lifecycle state machine · security boundaries · scaling notes | [system-design.md](./system-design.md) |

---

## RAG Pipeline and Content Quality

| Topic | Document |
|-------|----------|
| Pipeline architecture, hybrid retrieval, guardrails, reranking, eval | [RAG_PIPELINE.md](./RAG_PIPELINE.md) |
| Known gaps and enhancement roadmap (HyDE, MMR, streaming, citation enforcement) | [RAG_PIPELINE.md](./RAG_PIPELINE.md) |
| PDF quality checks, document governance, OSS tooling | [DOCUMENT_QUALITY.md](./DOCUMENT_QUALITY.md) |

Offline eval (from `backend/`): `python tools/evaluate_rag.py` (reads `data/eval_qa.json`, outputs `data/eval_metrics_results.json`).

---

## DevOps and CI/CD

| Topic | Document |
|-------|----------|
| **Full DevOps pipeline: CI, CD, Docker, K8s, observability, security** | [DEVOPS.md](./DEVOPS.md) |
| Docker Compose (API + SPA, observability profile, Redis) | [deploy/docker/README.md](../deploy/docker/README.md) |
| Kubernetes (Kustomize base + production overlay) | [deploy/k8s/README.md](../deploy/k8s/README.md) |
| Terraform (namespaces, optional kube-prometheus-stack) | [infra/terraform/README.md](../infra/terraform/README.md) |
| AWS EC2 production runbook (bootstrap, TLS, deploy, rollback, backup) | [AWS_EC2_PRODUCTION_GUIDE.md](./AWS_EC2_PRODUCTION_GUIDE.md) |
| GitHub Actions CI definition | [.github/workflows/ci.yml](../.github/workflows/ci.yml) |
| GitHub Actions CD (tag-triggered deploy) | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) |

---

## MLOps

| Topic | Document |
|-------|----------|
| **Full MLOps lifecycle: data, features, eval, deploy, monitoring** | [mlops/README.md](../mlops/README.md) |
| Ragas eval CI integration, feedback loop, concept drift detection | [mlops/README.md](../mlops/README.md) |
| Recommended extensions (DVC, MLflow, LakeFS, OpenTelemetry) | [mlops/README.md](../mlops/README.md) |
| Prometheus / Grafana Docker configs | `observability/docker/` |

---

## API Discovery

| Environment | URL |
|-------------|-----|
| Local (when `ENVIRONMENT` ≠ `production`) | Swagger: `http://127.0.0.1:8000/docs` · ReDoc: `/redoc` · OpenAPI JSON: `/openapi.json` |
| Production | Disabled unless `EXPOSE_API_DOCS=true` |

Full endpoint reference: [README.md — API Endpoints](../README.md#api-endpoints-summary)

---

## Conventions

- **Database:** PostgreSQL (`DATABASE_URL`), e.g. Neon. SQLite is not supported anywhere.
- **Secrets:** Never commit `backend/.env`, `backend/.env.local`, or `frontend/.env`. Templates only.
- **Paths:** Chroma under `backend/data/chroma_db`; Whoosh under `backend/data/whoosh_index` (defaults).
- **Roles:** `employee`, `knowledge_admin`, `domain_expert`, `system_admin`. Docs use "admin" as a shorthand for any elevated role.
- **Model sync:** changing `EMBEDDING_MODEL` requires a full reindex — `python -m ingestion.main`. The vector store and embedding model must always match.
