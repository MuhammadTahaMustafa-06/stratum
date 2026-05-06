# Documentation quality and RAG relevance

*Project documentation index: [docs/README.md](./README.md).*

## What “quality” means here

| Layer | Question | Owner |
|--------|-----------|--------|
| **Process** | Is this the right policy/version, approved for staff, and not stale? | KM / compliance |
| **Technical** | Can we extract enough clean text for chunking, embeddings, and BM25? | Ingest + automation |
| **RAG outcome** | Do answers grounded on this doc pass evals and spot checks? | MLOps + SMEs |

This codebase today adds **technical** checks at PDF upload (`assess_pdf_for_rag` in `backend/app/services/document_quality.py`): page count, extractable character count, and simple density heuristics. That is **not** topical relevance scoring; relevance still needs governance (allowed domains), human review, and/or retrieval evals.

## Existing controls in Stratum

- **Upload**: PDF magic bytes, size cap, empty file rejection; then **quality report** on the saved file (tier `ok` / `warn` / `fail` + messages).
- **Ingest**: LangGraph pipeline with dedup by file hash; chunks go to Chroma + Whoosh for hybrid search.
- **Runtime**: Guardrails (injection patterns, PII masking, confidence thresholds).
- **Eval**: `backend/tools/evaluate_rag.py` and a golden `eval_qa.json` — use these to see whether the **corpus** (including new docs) still answers known questions well.

## Open-source tools (by phase)

Use these in pre-commit, CI, or scheduled jobs as appropriate; all are OSS unless noted.

### Before upload (authoring)

- **Markdown / prose**: [Vale](https://vale.sh/) (style and terminology), [markdownlint](https://github.com/DavidAnson/markdownlint) for repo docs.
- **Secrets in files**: [gitleaks](https://github.com/gitleaks/gitleaks) or [trufflehog](https://github.com/trufflesecurity/trufflehog) in CI.

### PDF / office normalization

- **Repair linearize**: [qpdf](https://github.com/qpdf/qpdf).
- **OCR for scans** (so text RAG has text): [ocrmypdf](https://ocrmypdf.readthedocs.io/) (Tesseract under the hood).
- **Structure-aware extraction** (optional upgrade path): [Unstructured](https://github.com/Unstructured-IO/unstructured) or [Apache Tika](https://tika.apache.org/).

### This project’s stack (already in use)

- **pdfplumber** — text extraction for the upload-time quality report (same family of checks you can extend in CI over `data/raw/*.pdf`).

### Near-duplicates and drift

- **Near-duplicate text**: [datasketch](https://github.com/ekzhu/datasketch) (MinHash LSH) across chunk hashes or titles.
- **Fuzzy titles**: [RapidFuzz](https://github.com/maxbachmann/RapidFuzz) to flag uploads that match existing articles.

### Language / readability (optional)

- **Language id**: [lingua](https://github.com/pemistahl/lingua-py) or [fastText](https://fasttext.cc/) if you must enforce a single language per collection.
- **Readability**: [textstat](https://github.com/shivam5991/textstat) for internal comms, not for legal PDFs where high complexity is expected.

### RAG-specific quality

- **Retrieval + generation metrics**: keep running `backend/tools/evaluate_rag.py`; add [Ragas](https://github.com/explodinggradients/ragas) or [DeepEval](https://github.com/confident-ai/deepeval) in CI if you want faithfulness / answer relevance scores on a fixed dataset.
- **Local LLM-as-judge** (optional, air-gapped): [Ollama](https://ollama.com/) + a small judge prompt batch over new chunks — treat as noisy signal, not a gate alone.

### Operations

- **Metrics**: Prometheus (already integrated in this repo’s direction) for ingest duration, chunk counts, upload quality tier counts.
- **Tracing**: Langfuse spans on ask/chat to correlate bad answers with sources.

## Practical policy

1. **Human**: maintain a short checklist (version, owner, domain tag, retention) before PDFs hit `data/raw`.
2. **Automated**: fail CI or nightly jobs if new PDFs in `raw/` have `tier=fail` from the same heuristic the API uses (call `assess_pdf_for_rag` in a small script).
3. **RAG**: block or downgrade docs in the index only after you have explicit rules (e.g. `review_status` in DB) — the upload API does **not** delete low-quality files so you can still OCR and re-upload.

For pipeline internals, see [RAG_PIPELINE.md](./RAG_PIPELINE.md).
