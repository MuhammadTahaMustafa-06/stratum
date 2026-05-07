# Environment templates (committed — no secrets)

| File | Purpose |
|------|---------|
| `backend.env.local` | Copy to `backend/.env.local` for local API + ingestion. |
| `backend.env.prod` | Reference for server `backend/.env`, K8s Secret, or vault (inject real values). |
| `frontend.vite.example` | Copy to `frontend/.env` for Vite dev (`.example` suffix avoids repo `*.env` gitignore). Same `VITE_*` keys go to GitHub Actions secrets for production images. |

**Backend must not contain `VITE_*`** — those are build-time SPA variables and belong only in `frontend/.env` (local) or CI secrets (production).

```powershell
Copy-Item config/env/backend.env.local backend/.env.local
Copy-Item config/env/frontend.vite.example frontend/.env
```

Then edit each file and replace placeholders. See `config/SECRETS.md` for the full variable matrix, `docs/AWS_EC2_PRODUCTION_GUIDE.md` for EC2 production setup, and [docs/README.md](../../docs/README.md) for all documentation.

## Production wiring (quick steps)

1. **Backend runtime env on host**
   - Copy `config/env/backend.env.prod` to `/opt/stratum/backend/.env`.
   - Fill real secret values from your secret manager.
2. **Frontend build-time env in CI**
   - Mirror keys from `config/env/frontend.vite.example` into GitHub secrets (`VITE_*` in `.github/workflows/deploy.yml`).
   - Docker cannot change SPA env after the image is built.
3. **Deploy**
   - Tag release (`vX.Y.Z`) to trigger `.github/workflows/deploy.yml`.
   - Verify with `deploy/docker/scripts/smoke-test.sh`.
