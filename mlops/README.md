# MLOps — ingestion, embeddings, and release alignment

Stratum’s “ML” surface today is **retrieval + LLM inference**, not a large custom training loop. This folder documents how to align MLOps practice with the DevOps pipeline.

## Stages

| Stage | Tooling | Notes |
|-------|---------|------|
| **Data** | `backend/ingestion/`, raw PDFs in `backend/data/raw` | Treat corpora as versioned artifacts (Git LFS, S3, or DVC). |
| **Features** | Sentence-transformers embeddings + Chroma | Rebuild on schedule after ingestion; pin model name in config. |
| **Eval** | Langfuse + feedback API `/feedback` | Track latency, cost, and user ratings. |
| **Deploy** | Docker + K8s same image as CI | No separate “model server” unless you split reranker/LLM. |
| **Monitor** | Prometheus `/metrics` + Grafana | Alert on 5xx rate, latency, scrape failures. |

## Recommended extensions

- **DVC** or **LakeFS** for dataset versioning if regulatory teams require reproducible snapshots.
- **MLflow** (optional) if you add custom rerankers or fine-tuned small models.
- **OpenTelemetry**: set `OTEL_EXPORTER_OTLP_ENDPOINT` in production env (collector sidecar or shared collector in `observability` namespace).

## CI hooks

- Extend `.github/workflows/ci.yml` with a **nightly** job: `python -m ingestion.main --dry-run` or smoke reindex on a fixture corpus.
- Block releases if pytest fails or Docker build fails (already implied on `main`).

## Related paths

- Offline RAG metrics: from `backend/`, `python tools/evaluate_rag.py` (see `docs/RAG_PIPELINE.md`).
- Compose-based full stack: `deploy/docker/docker-compose.yml`.
