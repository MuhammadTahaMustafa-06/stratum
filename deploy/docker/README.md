# Docker Compose (Stratum)

Single compose file for API + SPA and an optional **observability** profile (Prometheus + Grafana). Broader context: [docs/DEVOPS.md](../../docs/DEVOPS.md), [docs/README.md](../../docs/README.md).

## Usage (from repository root)

Development build (local Dockerfile build):

```bash
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.dev.yml up -d --build
```

Production image pull (no local build):

```bash
APP_TAG=v1.0.0 \
BACKEND_IMAGE=ghcr.io/muhammadtahamustafa-06/stratum-backend \
FRONTEND_IMAGE=ghcr.io/muhammadtahamustafa-06/stratum-frontend \
GRAFANA_ADMIN_PASSWORD=change-this \
docker compose -f deploy/docker/docker-compose.yml up -d
```

Metrics profile:

```bash
docker compose -f deploy/docker/docker-compose.yml --profile observability up -d --build
```

- **Backend** reads `backend/.env` (create from `config/env/backend.env.local`). **`DATABASE_URL` must be your PostgreSQL URI** (e.g. Neon; not SQLite); include `?sslmode=require` if your connection string does not already set TLS.
- **Production compose is image-based** (`BACKEND_IMAGE`, `FRONTEND_IMAGE`, `APP_TAG`), matching `.github/workflows/deploy.yml`.
- **Frontend `VITE_*` values are build-time inputs** and must be passed during image build (see `.github/workflows/deploy.yml` and `config/env/frontend.env.production`).
- Local source builds are provided by `deploy/docker/docker-compose.dev.yml`.
- **Chroma / Whoosh** in the container use `/app/data/chroma_db` and `/app/data/whoosh_index` (volume `backend_data`).
- Scripts for production operations live in `deploy/docker/scripts/` (`deploy.sh`, `rollback.sh`, `smoke-test.sh`, `backup.sh`, `restore.sh`).

Production servers should run the same `-f deploy/docker/docker-compose.yml` path (see `.github/workflows/deploy.yml`).
