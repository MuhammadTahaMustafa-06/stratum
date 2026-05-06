"""
Reciprocal Rank Fusion (RRF) for hybrid dense + BM25 retrieval.
"""
from __future__ import annotations

from typing import Any, List

from app.core.config import settings


def _doc_shell(doc_id: str, item: dict[str, Any]) -> dict[str, Any]:
    """Normalise fused document shape for the reranker (expects id, text, metadata)."""
    return {
        "id": doc_id,
        "text": item.get("text", ""),
        "metadata": item.get("metadata") or {},
        "distance": item.get("distance"),
        "score": item.get("score"),
        "bm25_rank": item.get("bm25_rank"),
    }


def reciprocal_rank_fusion(
    vector_results: List[dict],
    bm25_results: List[dict],
    k: int = 60,
) -> List[dict]:
    """Merge vector and BM25 lists using RRF; preserve metadata from whichever list supplied it."""
    fused_scores: dict[str, float] = {}
    docs: dict[str, dict[str, Any]] = {}

    for rank, item in enumerate(vector_results):
        doc_id = str(item["id"])
        if doc_id not in fused_scores:
            fused_scores[doc_id] = 0.0
            docs[doc_id] = _doc_shell(doc_id, item)
        fused_scores[doc_id] += 1.0 / (k + rank + 1)

    for rank, item in enumerate(bm25_results):
        doc_id = str(item["id"])
        if doc_id not in fused_scores:
            fused_scores[doc_id] = 0.0
            docs[doc_id] = _doc_shell(doc_id, item)
        else:
            # BM25 hit same chunk: enrich empty metadata from vector-only shell
            if not docs[doc_id].get("metadata") and item.get("metadata"):
                docs[doc_id]["metadata"] = item["metadata"]
        fused_scores[doc_id] += 1.0 / (k + rank + 1)

    sorted_docs = sorted(docs.values(), key=lambda d: fused_scores[str(d["id"])], reverse=True)
    return sorted_docs[: settings.top_k_fusion]
