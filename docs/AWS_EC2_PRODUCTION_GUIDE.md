# AWS EC2 Production Guide (Docker Compose)

This runbook standardizes production deployment for Stratum on a single AWS EC2 host using image-based Docker Compose.

Related docs: `docs/DEVOPS.md`, `deploy/docker/README.md`, `config/SECRETS.md`, `config/env/README.md`.

## Fresh setup: new EC2 + public IP + domain

Use this when you are starting from scratch: you have an **EC2 public IP** (prefer an **Elastic IP** so it does not change) and a **DNS name** visitors will use (apex like `stratum.page`, with or without `www`). Replace `YOUR_DOMAIN` below with your apex hostname (no `https://`).

### 1) DNS (at your registrar or Route 53)

- Create an **`A`** record: **`YOUR_DOMAIN` → your Elastic IP** (and **`AAAA`** if you use IPv6 on the instance).
- If you will request a certificate for **`www.YOUR_DOMAIN`**, add either **`A` `www` → same IP** or **`CNAME` `www` → `YOUR_DOMAIN`**.
- Wait until lookups return the new IP (can take a few minutes to hours).

### 2) AWS security group

Inbound: **`22/tcp`** from your admin IP only; **`80`** and **`443`** from `0.0.0.0/0` (and `::/0` if IPv6). Outbound: default is usually fine.

### 3) Server bootstrap (first login, often as `ubuntu`)

Create a deploy user, harden SSH, firewall, Docker, and app layout (adapt package names if not Ubuntu):

```bash
sudo adduser deployer
sudo usermod -aG sudo deployer
# Copy your SSH public key into /home/deployer/.ssh/authorized_keys; set Permissions 700 / 600.
# In /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin no — then: sudo systemctl reload ssh

sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# Docker (official convenience script or Docker’s Ubuntu repo — see https://docs.docker.com/engine/install/ubuntu/)
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker deployer

sudo mkdir -p /opt/stratum/backups
sudo chown -R deployer:deployer /opt/stratum
```

Log in as **`deployer`** for the rest (or use `sudo su - deployer`).

### 4) Application code and secrets

```bash
cd /opt/stratum
git clone <YOUR_REPO_SSH_OR_HTTPS_URL> .
# Or rsync/scp the repo tree here.

cp config/env/backend.env.prod backend/.env
nano backend/.env   # set DATABASE_URL, JWT_SECRET_KEY, GROQ_API_KEY, RATE_LIMIT_STORAGE_URL=redis://redis:6379/0, etc.
```

Never commit `backend/.env`. See **Runtime configuration and secrets** below for the full variable list.

### 5) TLS certificate (before enabling the `443` nginx block)

Install nginx and Certbot, then obtain a cert with **webroot** (port **80** must hit this host on **`YOUR_DOMAIN`** — DNS + UFW + SG):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/html
# If the default site already serves /var/www/html on :80, you can run certbot next.
# Request every hostname you will put in nginx server_name (first -d becomes /etc/letsencrypt/live/<name>/):
sudo certbot certonly --webroot -w /var/www/html -d YOUR_DOMAIN -d www.YOUR_DOMAIN
# Apex-only: omit -d www.YOUR_DOMAIN
```

The certificate files will live under **`/etc/letsencrypt/live/<first -d name>/`**.

### 6) Host nginx

```bash
sudo cp /opt/stratum/deploy/ec2/host-nginx.conf.example /etc/nginx/sites-available/stratum
```

- If **`YOUR_DOMAIN` is `stratum.page`** and you included **`www.stratum.page`** in Certbot, the example file matches: enable it.
- Otherwise, edit **`server_name`** and the **`ssl_certificate` / `ssl_certificate_key`** paths so the `live/` directory name matches Certbot’s first **`-d`** value.

```bash
sudo ln -sf /etc/nginx/sites-available/stratum /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # only if it conflicts on port 80
sudo nginx -t && sudo systemctl reload nginx
```

### 7) Run the stack

From `/opt/stratum`, set image registry/tag variables (see **Compose image deployment** below), then:

```bash
deploy/docker/scripts/deploy.sh
deploy/docker/scripts/smoke-test.sh
```

Smoke tests expect **`https://YOUR_DOMAIN`** (or curl to localhost) per your setup. In GitHub, set **`VITE_*`** and deploy secrets so built images match **`https://YOUR_DOMAIN`** (redirect URLs, API base `/api/v1`, etc.).

---

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

### Repeat setup on a new EC2 host (same as first-time)

Use this checklist when provisioning another instance or rebuilding from scratch:

1. Launch **Ubuntu 24.04 LTS**, attach **Elastic IP**, point **DNS A/AAAA** at it.
2. Security group: **22** from admin IPs only; **80** and **443** from `0.0.0.0/0` (and IPv6 if used).
3. SSH in: create **`deployer`**, harden SSH (no password auth), enable unattended upgrades, **UFW** allow OpenSSH + 80 + 443.
4. Install **Docker Engine + Compose plugin**; `sudo usermod -aG docker deployer`.
5. `sudo mkdir -p /opt/stratum/backups && sudo chown -R deployer:deployer /opt/stratum`.
6. As `deployer`: clone or rsync the app repo to **`/opt/stratum`**, create **`backend/.env`** from `config/env/backend.env.prod` (never commit).
7. Install **nginx** + **certbot** (`python3-certbot-nginx` on Ubuntu).
8. Obtain TLS with **`certbot certonly --webroot`** (section **Fresh setup** §5), copy **`deploy/ec2/host-nginx.conf.example`** to **`/etc/nginx/sites-available/stratum`** (edit names/paths if domain is not `stratum.page`), symlink **`sites-enabled`**, **`sudo nginx -t`** and **`reload`**.
9. Set **`BACKEND_IMAGE`**, **`FRONTEND_IMAGE`**, **`APP_TAG`**, **`GRAFANA_*`** if using observability, then run **`deploy/docker/scripts/deploy.sh`** and **`smoke-test.sh`**.
10. Confirm GitHub **Actions secrets** for deploy and all **`VITE_*`** build args match this environment.

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

- Create `backend/.env` on the host from `config/env/backend.env.prod`.
- Do not commit host `.env` files.
- Required minimum backend secrets:
  - `DATABASE_URL`
  - `JWT_SECRET_KEY` (generate with `openssl rand -hex 32`)
  - `GROQ_API_KEY`
  - `RATE_LIMIT_STORAGE_URL` (Redis in production; never `memory://`)
- Recommended production flags:
  - `ENVIRONMENT=production`
  - `EXPOSE_API_DOCS=false`
  - `RAG_WARMUP_ON_STARTUP=true` (set `false` only to speed startup during controlled maintenance windows)

### Frontend build-time env (required in CI)

Frontend production variables are injected **at image build time** in `.github/workflows/deploy.yml` (not from runtime docker env).  
Set these GitHub repository/environment secrets:

- `VITE_API_BASE` (recommended `/api/v1` when nginx proxies `/api` to backend)
- `VITE_NEON_AUTH_URL`
- `VITE_AUTH_REDIRECT_URL`
- `VITE_AUTH_PASSWORD_RESET_REDIRECT_URL`
- `VITE_AUTH_REFRESH_COOKIE` (`true` when backend uses HttpOnly refresh cookie)

Reference template (no secrets): `config/env/frontend.vite.example`.

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
- Proxy `/` to frontend on `127.0.0.1:8080` and `/api/` (plus `/uploads/` and `/knowledge/raw-pdf`) to backend on `127.0.0.1:8000`, matching `deploy/docker/docker-compose.yml` published ports and the paths proxied in `frontend/nginx.conf`.
- Enforce HTTPS redirect and modern TLS settings.

### Final host Nginx configuration (canonical)

The maintained template is **`deploy/ec2/host-nginx.conf.example`**. It includes:

- HTTP → HTTPS redirect with **`.well-known/acme-challenge/`** left on port 80 for renewals
- **`client_max_body_size`** (32m default; raise alongside `MAX_REQUEST_SIZE_MB` in `backend/.env` if you allow larger PDFs)
- **`/api/`**, **`/uploads/`**, **`/knowledge/raw-pdf`** → backend; **`/`** → frontend SPA container
- Sensible **proxy timeouts** (120s) for RAG-heavy requests
- **TLS 1.2+**, ECDHE cipher list, **HSTS**

Install on the server (from repo root on the host, e.g. `/opt/stratum`). The template references `ssl_certificate` paths that must exist first, so obtain certificates with **webroot** (port 80 only) before enabling the `443` block:

```bash
sudo mkdir -p /var/www/html
sudo certbot certonly --webroot -w /var/www/html -d stratum.page -d www.stratum.page

sudo cp deploy/ec2/host-nginx.conf.example /etc/nginx/sites-available/stratum
sudo ln -sf /etc/nginx/sites-available/stratum /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Ensure **DNS** has `A`/`AAAA` for **`stratum.page`** (and **`www.stratum.page`** if you include it in Certbot). The first `-d` name becomes the certificate directory: `/etc/letsencrypt/live/stratum.page/`, which matches the template.

If you use only the apex (no `www`), request a cert with `-d stratum.page` only and remove `www.stratum.page` from both `server_name` lines in the template before `nginx -t`.

Alternatively, if you already use **`certbot --nginx`**, let it install certificates once from a minimal `server { listen 80; ... }` vhost, then replace that vhost with this template and point `ssl_certificate` at the paths Certbot created.

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
