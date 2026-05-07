"""
Step 4 — Embedding Generation Module
Uses SentenceTransformers (all-MiniLM-L6-v2) to embed each chunk.
"""

import json
import logging
from typing import Any

from sentence_transformers import SentenceTransformer

from ingestion.config import EMBEDDING_MODEL, EMBEDDED_DATA_PATH, PROCESSED_DIR

logger = logging.getLogger(__name__)

# Module-level model cache
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Load the embedding model (cached)."""
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def generate_embeddings(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Generate embeddings for all chunks.

    Each output item contains:
    - text: original chunk text
    - metadata: chunk metadata
    - vector: list[float] embedding
    """
    if not chunks:
        logger.warning("No chunks to embed")
        return []

    model = _get_model()
    texts = [chunk["text"] for chunk in chunks]

    logger.info(f"Generating embeddings for {len(texts)} chunks...")
    vectors = model.encode(
        texts,
        show_progress_bar=True,
        batch_size=64,
        normalize_embeddings=True,
    )

    embedded: list[dict[str, Any]] = []
    for chunk, vector in zip(chunks, vectors):
        embedded.append({
            "text": chunk["text"],
            "metadata": chunk["metadata"],
            "vector": vector.tolist(),
        })

    # Save to JSON
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(EMBEDDED_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(embedded, f, indent=2, ensure_ascii=False)

    logger.info(f"Saved {len(embedded)} embedded chunks to {EMBEDDED_DATA_PATH}")
    return embedded
