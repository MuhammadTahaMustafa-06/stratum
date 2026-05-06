"""
PDF (raw) vs vector index vs portal article reconciliation for admin visibility.

RAG ingestion and KB articles are intentionally decoupled; this module makes gaps explicit.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

from app.models.article import Article
from app.schemas.km_schema import KnowledgeReconciliationArticleRef, KnowledgeSourceReconciliationRow
from app.services.retrieval_service import RetrievalService

Situation = Literal[
    "in_sync",
    "rag_only",
    "portal_not_indexed",
    "raw_only",
    "orphan_article",
    "portal_indexed_missing_raw",
    "vectors_missing_raw",
    "registry_only",
]


def normalize_pdf_key(name: str | None) -> str:
    if not name or not str(name).strip():
        return ""
    return Path(str(name).strip()).name.lower()


def classify_situation(has_article: bool, in_index: bool, has_raw: bool, in_registry: bool) -> Situation:
    if has_article and in_index and has_raw:
        return "in_sync"
    if has_article and in_index and not has_raw:
        return "portal_indexed_missing_raw"
    if has_article and not in_index and has_raw:
        return "portal_not_indexed"
    if has_article and not in_index and not has_raw:
        return "orphan_article"
    if not has_article and in_index and has_raw:
        return "rag_only"
    if not has_article and in_index and not has_raw:
        return "vectors_missing_raw"
    if not has_article and not in_index and has_raw:
        return "raw_only"
    if in_registry:
        return "registry_only"
    return "raw_only"


def _load_ingest_registry_keys(processed_dir: Path) -> set[str]:
    path = processed_dir / ".file_hashes.json"
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    if not isinstance(data, dict):
        return set()
    return {normalize_pdf_key(k) for k in data if isinstance(k, str) and normalize_pdf_key(k).endswith(".pdf")}


def _articles_by_pdf_key(db: Session) -> dict[str, list[Article]]:
    out: dict[str, list[Article]] = {}
    q = db.query(Article).filter(Article.system_name.isnot(None), Article.system_name != "")
    for art in q:
        key = normalize_pdf_key(art.system_name)
        if not key.endswith(".pdf"):
            continue
        out.setdefault(key, []).append(art)
    for key, rows in out.items():
        rows.sort(key=lambda a: (a.updated_at or a.created_at).timestamp(), reverse=True)
    return out


def build_knowledge_reconciliation_rows(
    db: Session,
    retriever: RetrievalService,
    raw_dir: Path,
    processed_dir: Path,
) -> list[KnowledgeSourceReconciliationRow]:
    raw_dir = raw_dir.resolve()
    processed_dir = processed_dir.resolve()

    raw_names: dict[str, str] = {}
    if raw_dir.exists():
        for p in raw_dir.glob("*.pdf"):
            k = normalize_pdf_key(p.name)
            if k:
                raw_names[k] = p.name

    chroma_names = retriever.distinct_indexed_pdf_basenames()
    registry_keys = _load_ingest_registry_keys(processed_dir)
    articles_map = _articles_by_pdf_key(db)

    all_keys = set(raw_names) | chroma_names | registry_keys | set(articles_map)

    rows: list[KnowledgeSourceReconciliationRow] = []
    for key in sorted(all_keys):
        has_raw = key in raw_names
        in_index = key in chroma_names
        in_registry = key in registry_keys
        arts = articles_map.get(key, [])
        has_article = len(arts) > 0
        situation = classify_situation(has_article, in_index, has_raw, in_registry)

        display = raw_names.get(key)
        if not display and arts:
            display = next((Path(a.system_name.strip()).name for a in arts if a.system_name), None)
        if not display:
            display = key

        article_refs = [
            KnowledgeReconciliationArticleRef(id=a.id, title=a.title, status=a.status) for a in arts[:8]
        ]
        rows.append(
            KnowledgeSourceReconciliationRow(
                file_name=display,
                file_name_key=key,
                has_raw=has_raw,
                in_vector_index=in_index,
                in_ingest_registry=in_registry,
                article_count=len(arts),
                articles=article_refs,
                situation=situation,
            )
        )
    return rows
