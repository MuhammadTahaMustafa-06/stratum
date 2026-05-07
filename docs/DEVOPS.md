# DevOps, observability, and MLOps integration

*Documentation index: [docs/README.md](./README.md).*

This repository wires **local dev**, **Docker Compose**, **Kubernetes (Kustomize)**, **Terraform** (namespaces + optional Prometheus stack), **CI (GitHub Actions + Jenkins)**, and **pytest** into one flow.

## Quick reference

| Concern | Location |
|---------|----------|
| Documentation index | `docs/README.md` |
| Env templates (local / prod) | `config/env/` |
| Secret management patterns | `config/SECRETS.md` |
| Backend tests | `backend/tests/` + `backend/requirements-ci.txt` (Postgres: CI uses service container; Jenkins spins Docker Postgres on port **5433**) |
| GitHub Actions | `.github/workflows/ci.yml` |
| Release / registry deploy | `.github/workflows/deploy.yml` |
| Jenkins | `Jenkinsfile` — Postgres via Docker (`stratum-ci-pg`), env-injected secrets for pytest (prefer credential store) |
| K8s manifests | `deploy/k8s/` |
| Terraform (observability bootstrap) | `infra/terraform/` |
| Docker Compose (API + frontend) | `deploy/docker/docker-compose.yml`, `deploy/docker/docker-compose.dev.yml`, `deploy/docker/scripts/`, `observability/docker/` |
| AWS EC2 production runbook | `docs/AWS_EC2_PRODUCTION_GUIDE.md` |
| System design | `docs/system-design.md` |
| RAG audit & eval | `docs/RAG_PIPELINE.md`, `backend/tools/evaluate_rag.py` |
| ML lifecycle notes | `mlops/README.md` |
| API (Swagger) local | `http://127.0.0.1:8000/docs` when `ENVIRONMENT` is not `production` |

## Local stack with metrics

1. Ensure `backend/.env` or `backend/.env.local` includes `METRICS_ENABLED=true` (see `config/SECRETS.md`).
2. Start app + observability:

```bash
docker compose -f deploy/docker/docker-compose.yml --profile observability up -d --build
```

3. Open **Grafana** at http://localhost:3000 (credentials from `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`), **Prometheus** at http://localhost:9090. Prometheus scrapes `backend:8000/metrics`.

## Kubernetes + Terraform

1. `terraform apply` in `infra/terraform/` creates namespaces and optionally installs **kube-prometheus-stack**.
2. Create `stratum-backend-secrets` (see `deploy/k8s/base/secrets.example.yaml`).
3. `kubectl apply -k deploy/k8s/overlays/production` after pushing images to your registry.

## Jenkins

The sample `Jenkinsfile` uses a **Docker** Postgres container for `pytest` (see stage **Postgres for tests**) and derives sensitive values from runtime environment variables. For production CI, inject secrets via `withCredentials` or your vault step; to deploy, wire registry auth the same way as in `.github/workflows/deploy.yml`.
