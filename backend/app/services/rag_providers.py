"""
Process-wide singletons for heavy RAG dependencies (embedding model, cross-encoder, Groq client).

FastAPI's default Depends() factory created a new RetrievalService per request, which
re-loaded SentenceTransformer and rebuilt Whoosh checks repeatedly — unacceptable in production.
"""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.services.llm_service import LLMService
    from app.services.reranker_service import RerankerService
    from app.services.retrieval_service import RetrievalService

_lock_r = threading.Lock()
_lock_rr = threading.Lock()
_lock_llm = threading.Lock()

_retriever: Optional[RetrievalService] = None
_reranker: Optional[RerankerService] = None
_llm: Optional[LLMService] = None


def get_retrieval_service() -> RetrievalService:
    global _retriever
    if _retriever is None:
        with _lock_r:
            if _retriever is None:
                from app.services.retrieval_service import RetrievalService

                _retriever = RetrievalService()
    return _retriever


def get_reranker_service() -> RerankerService:
    global _reranker
    if _reranker is None:
        with _lock_rr:
            if _reranker is None:
                from app.services.reranker_service import RerankerService

                _reranker = RerankerService()
    return _reranker


def get_llm_service() -> LLMService:
    global _llm
    if _llm is None:
        with _lock_llm:
            if _llm is None:
                from app.services.llm_service import LLMService

                _llm = LLMService()
    return _llm


def warmup_rag_services() -> None:
    """
    Preload heavy RAG dependencies once at process startup so first user query
    does not pay model initialization latency.
    """
    retriever = get_retrieval_service()
    reranker = get_reranker_service()
    get_llm_service()

    # Warm one tiny inference pass so CrossEncoder runtime is initialized.
    try:
        reranker.score_and_rank(
            "startup warmup",
            [{"id": "warmup", "text": "startup warmup text", "metadata": {}}],
        )
    except Exception:
        # Startup should remain resilient even if warmup inference fails.
        pass

    # Touch retrieval methods so model/tokenizer paths are fully initialized.
    try:
        retriever.search_vector("startup warmup")
    except Exception:
        pass
