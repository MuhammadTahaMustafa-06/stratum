"""
Step 5 — Chroma Storage Module
Creates collection and inserts embeddings.
Uses Chroma local persistent client.
"""

import logging
from typing import Any

import chromadb

from ingestion.config import (
    CHROMA_PERSIST_DIR,
    CHROMA_COLLECTION,
)

logger = logging.getLogger(__name__)


def _get_client() -> chromadb.PersistentClient:
    """Create and return a Chroma persistent client."""
    logger.info(f"Connecting to ChromaDB at: {CHROMA_PERSIST_DIR}")
    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    return client


def store_in_chroma(embedded_data: list[dict[str, Any]]) -> int:
    """
    Store all embedded chunks in Chroma.

    Returns the number of inserted records.
    """
    if not embedded_data:
        logger.warning("No data to store in Chroma")
        return 0

    client = _get_client()

    try:
        # Delete if exists to recreate
        client.delete_collection(name=CHROMA_COLLECTION)
        logger.info(f"Dropped existing collection: {CHROMA_COLLECTION}")
    except Exception:
        pass  # Collection doesn't exist

    collection = client.create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"}
    )
    logger.info(f"Created collection '{CHROMA_COLLECTION}' (COSINE)")

    # Insert in batches to avoid payload limits
    batch_size = 500
    total_inserted = 0

    for i in range(0, len(embedded_data), batch_size):
        batch = embedded_data[i : i + batch_size]

        ids = [item["metadata"]["chunk_id"] for item in batch]
        embeddings = [item["vector"] for item in batch]
        metadatas = [item["metadata"] for item in batch]
        documents = [item["text"] for item in batch]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )
        total_inserted += len(batch)
        logger.info(f"Inserted batch {i // batch_size + 1}: {len(batch)} records")

    logger.info(f"Collection '{CHROMA_COLLECTION}' ready — {total_inserted} records total")

    return total_inserted

