# Environment templates (committed — no secrets)

| File | Purpose |
|------|---------|
| `backend.env.local` | Copy to `backend/.env` for local API + ingestion. |
| `frontend.env.local` | Copy to `frontend/.env.local` for Vite dev. |
| `backend.env.production` | Reference for K8s Secret / server `backend/.env` (inject real values from a vault). |
| `frontend.env.production` | Reference for production SPA build (`npm run build` / Docker `ARG` / CI env). |

**Backend must not contain `VITE_*`** — those are build-time SPA variables and belong only in `frontend/.env.local` (or CI for the image build).

```powershell
Copy-Item config/env/backend.env.local backend/.env
Copy-Item config/env/frontend.env.local frontend/.env.local
```

Then edit each file and replace placeholders. See `config/SECRETS.md` for the full variable matrix, `docs/AWS_EC2_PRODUCTION_GUIDE.md` for EC2 production setup, and [docs/README.md](../../docs/README.md) for all documentation.

## Production wiring (quick steps)

1. **Backend runtime env on host**
   - Copy `config/env/backend.env.production` to `/opt/stratum/backend/.env`.
   - Fill real secret values from your secret manager.
2. **Frontend build-time env in CI**
   - Copy keys from `config/env/frontend.env.production` into GitHub secrets (`VITE_*`).
   - Do not expect docker runtime env to change SPA values after build.
3. **Deploy**
   - Tag release (`vX.Y.Z`) to trigger `.github/workflows/deploy.yml`.
   - Verify with `deploy/docker/scripts/smoke-test.sh`.
