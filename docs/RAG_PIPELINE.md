# RAG pipeline audit (Stratum)

*Project documentation index: [docs/README.md](./README.md).*

## What you have today (solid baseline)

| Stage | Implementation | Notes |
|-------|------------------|-------|
| **Ingest** | LangGraph: extract → clean → merge → chunk → embed → Chroma | File-hash dedup avoids rework. |
| **Retrieve** | Chroma dense + Whoosh BM25, metadata filters, Whoosh rebuilt from Chroma | Hybrid is appropriate for banking text (exact terms + semantic). |
| **Fuse** | Reciprocal Rank Fusion (RRF) | Standard, cheap, no training. |
| **Rerank** | CrossEncoder (`bge-reranker-base`) | Strong upgrade vs. fusion-only; `max_length=512` truncates long chunks. |
| **Generate** | Groq + grounded system prompt | Clear “answer from context only” policy. |
| **Safety** | Guardrails: injection regex, PII mask, confidence / rerank threshold | Good OWASP-style input gate. |
| **Obs** | Langfuse spans, query logs, optional Prometheus `/metrics` | Production-oriented. |
| **Doc QC (upload)** | `pdfplumber` extract + heuristics → `PdfQualityReport` on `/admin/upload-pdf` | Flags scan-only / empty text PDFs before reindex; see [DOCUMENT_QUALITY.md](./DOCUMENT_QUALITY.md). |

Heavy models (`SentenceTransformer`, `CrossEncoder`) are loaded **once per process** via `app/services/rag_providers.py` (singletons), not per HTTP request.

## Gaps vs. “top notch” production

1. **No query rewrite / HyDE** — user typos and vague questions hurt recall; optional LLM query expansion behind a flag.
2. **Chunking** — fixed token windows; no semantic / heading-aware splits; consider later upgrade for long policies.
3. **No explicit citation enforcement** — LLM is instructed to cite; you could add post-check that answer substrings overlap retrieved chunks (cheap heuristic).
4. **Reranker latency** — cross-encoder on every ask; for scale, cache rerank for identical query hashes or async precompute top-K.
5. **Multi-tenant isolation** — metadata filters + `enforce_metadata_team_scope`; verify all paths apply filters (search + ask + chat).
6. **Disaster recovery** — Chroma + Whoosh on disk/PVC; document backup, restore, and reindex SLO.
7. **Eval loop** — `backend/tools/evaluate_rag.py` + `data/eval_qa.json` uses **Ragas** (faithfulness, answer relevancy) with Groq + local embeddings; retrieval precision/recall unchanged; wire to CI nightly when you have a stable golden set.

## Cleanup done in codebase

- Removed broken **`create_eval_qa.py`** (wrong processed path / ad-hoc model).
- Replaced root **`evaluate.py`** with **`tools/evaluate_rag.py`** (paths relative to backend root, uses singleton retriever/reranker).
- Fixed **RRF** to always carry **metadata** into fused docs for reranking.
- **Whoosh rebuild** now uses `_normalise_meta` like the main index path.
- **Ingestion** docstring/logger references updated from Milvus to **ChromaDB**.

## Suggested next enhancements (priority order)

1. Nightly **eval job** on `eval_qa.json` + alert if faithfulness mean drops.
2. **Query preprocessing** (spellcheck / synonym map for banking acronyms) before vector encode.
3. **Source diversity** — MMR or dedupe by `file_name` so top-K is not one PDF repeated.
4. **Streaming** responses to the SPA for perceived latency.
5. **Rate limits** on `/ask` and `/chat` per user (SlowAPI keys by user id when authenticated).

This stack is **production-ready** for an internal KM pilot if operations (backups, secrets, index jobs, monitoring) are covered — not “research SOTA,” but appropriate for regulated internal use with clear upgrade paths.
