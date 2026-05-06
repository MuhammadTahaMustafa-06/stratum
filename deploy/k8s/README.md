# Kubernetes manifests (Kustomize)

For how these fit into the full platform, see [docs/README.md](../../docs/README.md) and [config/SECRETS.md](../../config/SECRETS.md).

## Layout

- `base/` — Deployments, Services, Ingress, ConfigMap. **Do not** commit real `Secret` data; use `secrets.example.yaml` as a template.
- `overlays/production/` — Image tags, replicas, and production labels.

## Quick apply

```bash
# Build & push images first: stratum-backend:tag , stratum-frontend:tag
kubectl apply -k deploy/k8s/base
# or production overlay:
kubectl apply -k deploy/k8s/overlays/production
```

## Secrets

Use `base/secrets.example.yaml` as a template (copy to a gitignored `secrets.yaml` or create literals from CI). Minimum keys: `JWT_SECRET_KEY`, `GROQ_API_KEY`, `DATABASE_URL` (PostgreSQL / Neon URI). See [config/SECRETS.md](../../config/SECRETS.md).

```bash
kubectl -n stratum create secret generic stratum-backend-secrets \
  --from-literal=JWT_SECRET_KEY=... \
  --from-literal=GROQ_API_KEY=... \
  --from-literal=DATABASE_URL=...
```

## Observability

1. Enable `METRICS_ENABLED=true` (ConfigMap in `base/configmap.yaml`).
2. Install Prometheus Operator (see `infra/terraform`) or use Compose with the observability profile: `docker compose -f deploy/docker/docker-compose.yml --profile observability up -d`.
3. Optional: add a `ServiceMonitor` once the `monitoring.coreos.com` CRDs exist in the cluster.
