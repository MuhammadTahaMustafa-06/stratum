"""
Cross-Encoder Reranking
Scores query-document pairs using a fine-tuned cross-encoder.
"""
from typing import List, Dict, Any
from sentence_transformers import CrossEncoder
from app.core.config import settings

class RerankerService:
    def __init__(self):
        self.bge_reranker = CrossEncoder(settings.reranker_model, max_length=512)

    def score_and_rank(self, query: str, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Score each document using the reranker and sort."""
        if not documents:
            return []

        pairs = [[query, doc["text"]] for doc in documents]
        scores = self.bge_reranker.predict(pairs)

        for idx, score in enumerate(scores):
            documents[idx]["reranker_score"] = float(score)

        sorted_docs = sorted(documents, key=lambda x: x["reranker_score"], reverse=True)
        return sorted_docs[:settings.top_k_rerank]
