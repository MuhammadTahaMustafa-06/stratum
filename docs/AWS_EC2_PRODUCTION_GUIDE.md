# AWS EC2 Production Guide (Docker Compose)

This runbook standardizes production deployment for Stratum on a single AWS EC2 host using image-based Docker Compose.

Related docs: `docs/DEVOPS.md`, `deploy/docker/README.md`, `config/SECRETS.md`, `config/env/README.md`.

## 0) Production rollout order (simple pipeline)

Follow this exact order so every layer is connected correctly:

1. **Prepare infrastructure** (EC2, DNS, security group, Docker).
2. **Prepare secrets and env files** (`backend/.env` on host; GitHub Actions secrets for frontend build-time `VITE_*`).
3. **Run CI on main** (`.github/workflows/ci.yml`) until green.
4. **Create release tag** (`vX.Y.Z`) to trigger `.github/workflows/deploy.yml`.
5. **Deploy images on host** using `deploy/docker/scripts/deploy.sh`.
6. **Run smoke tests** using `deploy/docker/scripts/smoke-test.sh`.
7. **Verify app/auth/api/metrics manually**.
8. **Keep rollback ready** using `deploy/docker/scripts/rollback.sh`.

## 1) Architecture baseline

- EC2 Ubuntu 24.04 LTS (or Amazon Linux 2023) in private/public subnet as needed.
- Security Group:
  - Inbound `22` from admin IP ranges only.
  - Inbound `80` and `443` from the internet.
  - Optional inbound `3000` and `9090` only from trusted VPN/IP if observability is exposed.
- DNS record points your domain to EC2 Elastic IP.
- Docker + Docker Compose plugin installed on host.
- Application deployed from `/opt/stratum`.

## 2) Host bootstrap and hardening

1. Create non-root deploy user (example: `deployer`), disable password login, enforce SSH keys.
2. Enable automatic security updates.
3. Configure UFW (or equivalent):
   - allow `OpenSSH`, `80/tcp`, `443/tcp`
   - deny everything else by default
4. Install Docker engine and Compose plugin.
5. Add deployer to docker group.
6. Create base folders:

```bash
sudo mkdir -p /opt/stratum /opt/stratum/backups
sudo chown -R deployer:deployer /opt/stratum
```

## 3) Runtime configuration and secrets

- Create `backend/.env` on the host from `config/env/backend.env.production`.
- Do not commit host `.env` files.
- Required minimum backend secrets:
  - `DATABASE_URL`
  - `JWT_SECRET_KEY` (generate with `openssl rand -hex 32`)
  - `GROQ_API_KEY`
  - `RATE_LIMIT_STORAGE_URL` (Redis in production; never `memory://`)
- Recommended production flags:
  - `ENVIRONMENT=production`
  - `EXPOSE_API_DOCS=false`
  - `RAG_WARMUP_ON_STARTUP=true`
  - `RAG_WARMUP_ON_STARTUP=true` (set false only to speed startup during controlled maintenance windows)

### Frontend build-time env (required in CI)

Frontend production variables are injected **at image build time** in `.github/workflows/deploy.yml` (not from runtime docker env).  
Set these GitHub repository/environment secrets:

- `VITE_API_BASE` (recommended `/api/v1` when nginx proxies `/api` to backend)
- `VITE_NEON_AUTH_URL`
- `VITE_AUTH_REDIRECT_URL`
- `VITE_AUTH_PASSWORD_RESET_REDIRECT_URL`
- `VITE_AUTH_REFRESH_COOKIE` (`true` when backend uses HttpOnly refresh cookie)

### User avatars (S3)

For production, store uploaded profile images in **Amazon S3** instead of the EC2 disk:

1. Create a private bucket (or public-read objects only if you accept that model; prefer **CloudFront + OAC**).
2. Set in `backend/.env`:
   - `S3_AVATAR_BUCKET` — bucket name
   - `S3_AVATAR_REGION` — e.g. `us-east-1`
   - `S3_PUBLIC_BASE_URL` — HTTPS base viewers use (typically **CloudFront distribution URL**), no trailing slash
   - Optional: `S3_AVATAR_KEY_PREFIX` (default `avatars`)
3. Grant the API process **`s3:PutObject`** and **`s3:DeleteObject`** on `arn:aws:s3:::bucket/prefix/*` (via EC2 instance profile IAM role, or explicit keys in non-production only).
4. After deploy, `POST /api/v1/auth/me/avatar` writes to S3 and returns a full `avatar_url` under `S3_PUBLIC_BASE_URL`.

## 4) Compose image deployment model

Production deploys pull prebuilt images (no host-side builds).

- `BACKEND_IMAGE` example: `ghcr.io/your-org/stratum-backend`
- `FRONTEND_IMAGE` example: `ghcr.io/your-org/stratum-frontend`
- `APP_TAG` example: `v1.4.2`

Deploy command:

```bash
cd /opt/stratum
export APP_TAG=v1.4.2
export BACKEND_IMAGE=ghcr.io/your-org/stratum-backend
export FRONTEND_IMAGE=ghcr.io/your-org/stratum-frontend
export GRAFANA_ADMIN_USER=admin
export GRAFANA_ADMIN_PASSWORD='<strong-password>'
deploy/docker/scripts/deploy.sh
deploy/docker/scripts/smoke-test.sh
```

## 5) TLS and reverse proxy

- Terminate TLS at host proxy (Nginx/Caddy/Traefik).
- Use Let's Encrypt (ACME) certificates with auto-renew.
- Proxy `/` to frontend on `localhost:80` and `/api/` to backend on `localhost:8000`.
- Enforce HTTPS redirect and modern TLS settings.

## 6) CI/CD release flow

- `deploy.yml` builds and pushes backend/frontend images tagged with Git tag (`v*.*.*`).
- Remote deploy runs:
  - `deploy/docker/scripts/deploy.sh`
  - `deploy/docker/scripts/smoke-test.sh`
- Keep rollback tag available for fast recovery.

### Minimal production pipeline (step-by-step commands)

1. Merge validated changes to `main`.
2. Create release tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

3. Wait for `Deploy to Production` workflow to finish successfully.
4. On EC2 host, confirm containers and health:

```bash
cd /opt/stratum
docker compose -f deploy/docker/docker-compose.yml ps
deploy/docker/scripts/smoke-test.sh
```

5. If smoke fails, rollback immediately:

```bash
cd /opt/stratum
export BACKEND_IMAGE=ghcr.io/your-org/stratum-backend
export FRONTEND_IMAGE=ghcr.io/your-org/stratum-frontend
export APP_TAG_PREVIOUS=v0.9.9
deploy/docker/scripts/rollback.sh
deploy/docker/scripts/smoke-test.sh
```

## 7) Rollback procedure

```bash
cd /opt/stratum
export BACKEND_IMAGE=ghcr.io/your-org/stratum-backend
export FRONTEND_IMAGE=ghcr.io/your-org/stratum-frontend
export APP_TAG_PREVIOUS=v1.4.1
deploy/docker/scripts/rollback.sh
deploy/docker/scripts/smoke-test.sh
```

## 8) Backup and restore

Backup persistent volume:

```bash
cd /opt/stratum
deploy/docker/scripts/backup.sh
```

Restore from archive:

```bash
cd /opt/stratum
BACKUP_ARCHIVE=/opt/stratum/backups/backend_data_YYYYMMDD-HHMMSS.tar.gz \
deploy/docker/scripts/restore.sh
```

## 9) Production checklist

- [ ] SSH hardened and restricted.
- [ ] `.env` created on host only, not in git.
- [ ] GitHub deploy secrets set (`DOCKER_*`, `DEPLOY_*`, `GRAFANA_*`, all required `VITE_*`).
- [ ] JWT secret rotated and stored in secret manager.
- [ ] Redis-backed rate limit configured.
- [ ] TLS enabled with valid certificate.
- [ ] S3 avatar bucket + `S3_PUBLIC_BASE_URL` configured; EC2 role can `PutObject`/`DeleteObject` on the avatar prefix.
- [ ] Deploy and rollback scripts tested.
- [ ] Smoke tests pass after deploy.
- [ ] Backup/restore tested quarterly.
