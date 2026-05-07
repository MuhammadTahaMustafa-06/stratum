# Secrets and configuration management

## Principles

- **Never** commit `backend/.env`, `backend/.env.local`, `frontend/.env`, or raw production credentials.
- **Rotate** JWT signing keys and database passwords on a schedule.
- **Separate** build-time (`VITE_*`) from runtime (backend only) secrets.
- **Authoritative schema:** all backend keys map to `backend/app/core/config.py` (`Settings`); use `UPPER_SNAKE_CASE` in `.env`.

## Local development

1. Copy committed templates from `config/env/` (see `config/env/README.md`): `backend.env.local` → `backend/.env.local`, `frontend.vite.example` → `frontend/.env`.
2. Replace every placeholder; generate `JWT_SECRET_KEY` with `openssl rand -hex 32`.
3. Variable reference tables below; full schema in `backend/app/core/config.py` (`Settings`).

### pytest / CI

Tests require PostgreSQL. Default for local runs is `postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/stratum_test` (override with `DATABASE_URL`). GitHub Actions defines `DATABASE_URL` pointing at the workflow service container hostname `postgres`.

### Backend (`backend/.env.local` locally; `backend/.env` on Docker hosts)

| Variable | Required | Notes |
|----------|----------|--------|
| `GROQ_API_KEY` | Yes (chat/RAG) | Groq console |
| `JWT_SECRET_KEY` | Yes | Min 32 chars; `openssl rand -hex 32` |
| `DATABASE_URL` | Yes | PostgreSQL URI (e.g. **Neon** dashboard → **pooler** connection string). Use `postgresql+psycopg2://…` and `?sslmode=require` as needed. |
| `NEON_AUTH_URL` | For Google / Neon email signup | Same **Auth URL** as Neon Console → Auth (must match `VITE_NEON_AUTH_URL`). JWKS at `{NEON_AUTH_URL}/.well-known/jwks.json`. |
| `DATABASE_DNS_FALLBACK` | No | Set `true` if OS DNS cannot resolve the DB hostname but HTTPS works (uses DoH + `hostaddr`). |
| `DATABASE_HOSTADDR` | No | Optional literal IP for libpq when DoH is unavailable. |
| `CHROMA_PERSIST_DIR` | No | Default `data/chroma_db` |
| `WHOOSH_INDEX_DIR` | No | Default `data/whoosh_index` |
| `CORS_ORIGINS` | No | Comma-separated origins |
| `ALLOWED_HOSTS` | No | Comma-separated hostnames |
| `ENVIRONMENT` | No | Default `development`; set `production` for stricter startup checks (`DATABASE_URL` required, etc.) |
| `AUTH_REFRESH_HTTPONLY_COOKIE` | No | Default **`true`** (dev + prod): refresh only as **HttpOnly** cookie; JSON has `refresh_token: null`. Over HTTP dev, cookie is not `Secure`. Set `false` only with `VITE_AUTH_REFRESH_COOKIE=false`. Production HTTPS still uses `Secure` automatically unless `AUTH_COOKIE_SECURE` overrides. |
| `AUTH_REFRESH_COOKIE_NAME` | No | Default `stratum_refresh` |
| `AUTH_COOKIE_DOMAIN` | No | e.g. `.example.com` for subdomains; empty = host-only |
| `AUTH_COOKIE_SAMESITE` | No | `lax` (default), `strict`, or `none` (`none` needs HTTPS) |
| `AUTH_COOKIE_SECURE` | No | Override cookie `Secure` flag; default secure in production when unset |
| `LLM_MODEL` | No | Default `llama-3.3-70b-versatile` |
| `EMBEDDING_MODEL` | No | Default `all-MiniLM-L6-v2` |
| `LANGFUSE_*` | No | Observability |
| `METRICS_ENABLED` | No | `GET /metrics` when `true` |
| `SEED_DEMO_USERS` | No | Default `false` in code; keep `false` in production |
| `SEED_DEMO_USERS_MERGE_MISSING` | No | When `true`, also insert any **missing** demo emails (`admin@apex.local`, etc.) if other users already exist. |
| `SEED_SAMPLE_KNOWLEDGE_ARTICLES` | No | Default `false`; keep disabled in production. |
| `SEED_SAMPLE_ARTICLES_MERGE_MISSING` | No | When `true`, insert sample articles **by title** if not already present (even when other articles exist). |
| `SEED_PASSWORD_*` | No | Optional overrides for seeded accounts; keys in `app/services/bootstrap.py` |
| `S3_AVATAR_BUCKET` | No | When set, `POST /auth/me/avatar` stores files in this S3 bucket instead of local disk |
| `S3_AVATAR_REGION` | No | AWS region for the bucket (e.g. `us-east-1`) |
| `S3_ENDPOINT_URL` | No | Optional custom S3-compatible endpoint (maps to `s3_endpoint_url`) |
| `S3_AVATAR_KEY_PREFIX` | No | Object key prefix (default `avatars`) |
| `S3_PUBLIC_BASE_URL` | With S3 avatars | HTTPS URL prefix for browser-visible objects (e.g. CloudFront or virtual-host S3 URL), **no trailing slash** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | No | Optional explicit keys; on EC2 prefer IAM instance profile |

Optional: Langfuse, `OTEL_EXPORTER_OTLP_ENDPOINT`, rate limit Redis URL — see `Settings` in code.

## EC2 + Docker Compose production notes

- Use image-based compose in `deploy/docker/docker-compose.yml` with:
  - `BACKEND_IMAGE`
  - `FRONTEND_IMAGE`
  - `APP_TAG`
- Keep `backend/.env` only on the server (`/opt/stratum/backend/.env`), never committed.
- Set `RATE_LIMIT_STORAGE_URL` to Redis in production.
- Set `GRAFANA_ADMIN_PASSWORD` as a host environment variable before starting observability profile.
- Full runbook: `docs/AWS_EC2_PRODUCTION_GUIDE.md`.

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_BASE` | No | Default `/api/v1` (Vite proxy to API in dev); full URL only if SPA talks to API without proxy |
| `VITE_AUTH_REFRESH_COOKIE` | No | Default **on** (omit or `true`). Set `false` for legacy JSON refresh in localStorage + `AUTH_REFRESH_HTTPONLY_COOKIE=false` on the API. |

## Production (recommended stack)

| Tool | Role |
|------|------|
| **External Secrets Operator** | Pulls AWS SM / GCP SM / Vault into Kubernetes `Secret`. |
| **Sealed Secrets** | GitOps-friendly encrypted Secret manifests. |
| **SOPS + age** | Encrypt tfvars or YAML for a small team without a cluster operator. |

### Kubernetes wiring

- Backend Deployment uses `envFrom` → `secretRef: stratum-backend-secrets`.
- Keys in the Secret must match `Settings` field names (uppercase env, e.g. `JWT_SECRET_KEY`).

### Terraform

- Keep **non-secret** defaults in `terraform.tfvars.example`.
- Pass sensitive values via `TF_VAR_*` environment variables in CI/CD or `-var-file` generated at apply time from your vault.

## MLOps-related secrets

- LLM API keys (`GROQ_API_KEY`), Langfuse keys, and optional training API keys should use the same secret store as application secrets.
- Model artifacts: prefer object storage (S3 / GCS) with IAM roles — not copied into images.
