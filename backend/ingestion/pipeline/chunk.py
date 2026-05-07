"""
Step 3 — Table-Aware Chunking Module
Chunks documents with awareness of table boundaries.
Never splits table rows across chunks or mixes documents.
"""

import json
import logging
from datetime import datetime, timezone
from itertools import groupby
from typing import Any

import tiktoken

from ingestion.config import (
    CHUNK_SIZE_TOKENS,
    CHUNK_OVERLAP_TOKENS,
    CHUNKED_DATA_PATH,
    PROCESSED_DIR,
    VERSION,
    SOURCE_TYPE,
    DOCUMENT_TYPE,
)

logger = logging.getLogger(__name__)

# Use cl100k_base tokenizer (GPT-4 / modern models)
_tokenizer = tiktoken.get_encoding("cl100k_base")


def _infer_taxonomy(file_name: str) -> dict[str, str]:
    """
    Maps filename keywords → domain values aligned with the KMS UI filter pills:
      application | banking | process | tribal | general
    """
    name = file_name.lower()

    # Domain — matches KMS portal filter pill values
    if any(k in name for k in ("api", "system", "architecture", "integration", "service", "app", "software", "module")):
        domain = "application"
    elif any(k in name for k in ("kyc", "aml", "compliance", "regulatory", "risk", "audit", "swift", "sepa", "payment", "loan", "credit", "refund", "chargeback", "faq", "sop", "bank")):
        domain = "banking"
    elif any(k in name for k in ("process", "runbook", "procedure", "workflow", "sop", "guideline", "policy", "onboard")):
        domain = "process"
    elif any(k in name for k in ("team", "tribal", "knowledge", "internal", "onboarding", "handbook", "wiki")):
        domain = "tribal"
    else:
        domain = "banking"  # default for banking-context docs

    # System and team — more granular metadata
    if any(k in name for k in ("swift", "payment", "sepa", "wire")):
        system = "payments-engine"
        team = "payments-ops"
        process = "payment-processing"
    elif any(k in name for k in ("kyc", "aml", "compliance", "risk")):
        system = "compliance-platform"
        team = "risk-compliance"
        process = "customer-due-diligence"
    elif any(k in name for k in ("loan", "credit", "lending")):
        system = "loan-management"
        team = "credit-operations"
        process = "loan-lifecycle"
    elif any(k in name for k in ("core", "bank", "account", "sop", "faq")):
        system = "core-banking"
        team = "shared-services"
        process = "general-banking"
    else:
        system = "core-banking"
        team = "shared-services"
        process = "general"

    return {
        "domain": domain,
        "system": system,
        "team": team,
        "process": process,
        "policy_version": "v1.0",
        "effective_date": datetime.now(timezone.utc).date().isoformat(),
    }


def _count_tokens(text: str) -> int:
    """Count tokens in text using tiktoken."""
    return len(_tokenizer.encode(text))


def _split_text_into_token_chunks(
    text: str,
    max_tokens: int,
    overlap_tokens: int,
) -> list[str]:
    """Split text into chunks respecting token limits with overlap."""
    tokens = _tokenizer.encode(text)
    if len(tokens) <= max_tokens:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = _tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)
        if end >= len(tokens):
            break
        start += max_tokens - overlap_tokens

    return chunks


def _build_table_aware_segments(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Build segments from pages, treating text and table blocks separately
    so that table rows are never split across chunks.
    """
    segments: list[dict[str, Any]] = []

    for page in pages:
        page_num = page["page_number"]

        # Regular text segment
        text = (page.get("text_content") or "").strip()
        if text:
            segments.append({
                "text": text,
                "page_number": page_num,
                "is_table": False,
            })

        # Table segments — each table is its own segment
        for table in page.get("tables", []):
            table_text = (table.get("table_text") or "").strip()
            if table_text:
                segments.append({
                    "text": table_text,
                    "page_number": page_num,
                    "is_table": True,
                })

    return segments


def chunk_single_document(
    pages: list[dict[str, Any]],
    doc_id: str,
    file_name: str,
) -> list[dict[str, Any]]:
    """
    Chunk a single document's pages with table awareness.

    Rules:
    - Chunk size: CHUNK_SIZE_TOKENS tokens
    - Overlap: CHUNK_OVERLAP_TOKENS tokens
    - Table rows are never split across chunks
    - If a table exceeds chunk size, it becomes its own chunk
    """
    segments = _build_table_aware_segments(pages)
    chunks: list[dict[str, Any]] = []

    current_text = ""
    current_pages: set[int] = set()
    current_has_table = False
    current_table_count = 0

    def _flush_chunk() -> None:
        nonlocal current_text, current_pages, current_has_table, current_table_count
        if not current_text.strip():
            current_text = ""
            current_pages = set()
            current_has_table = False
            current_table_count = 0
            return

        # Split if the accumulated text exceeds the chunk size
        sub_chunks = _split_text_into_token_chunks(
            current_text.strip(),
            CHUNK_SIZE_TOKENS,
            CHUNK_OVERLAP_TOKENS,
        )
        page_range = f"{min(current_pages)}-{max(current_pages)}" if current_pages else "1-1"

        for sub_chunk in sub_chunks:
            chunks.append({
                "text": sub_chunk,
                "page_number_range": page_range,
                "contains_table": current_has_table,
                "table_count": current_table_count,
            })

        current_text = ""
        current_pages = set()
        current_has_table = False
        current_table_count = 0

    for segment in segments:
        seg_tokens = _count_tokens(segment["text"])

        if segment["is_table"]:
            # If we have accumulated text, flush it first
            if current_text.strip():
                _flush_chunk()

            # Table as its own segment — may exceed chunk size but we keep it intact
            if seg_tokens > CHUNK_SIZE_TOKENS:
                # Large table becomes its own chunk(s)
                page_range = f"{segment['page_number']}-{segment['page_number']}"
                # Try to keep table intact; if too large, split at row boundaries
                table_lines = segment["text"].split("\n")
                current_table_chunk = ""
                for line in table_lines:
                    test = current_table_chunk + "\n" + line if current_table_chunk else line
                    if _count_tokens(test) > CHUNK_SIZE_TOKENS and current_table_chunk:
                        chunks.append({
                            "text": current_table_chunk.strip(),
                            "page_number_range": page_range,
                            "contains_table": True,
                            "table_count": 1,
                        })
                        current_table_chunk = line
                    else:
                        current_table_chunk = test
                if current_table_chunk.strip():
                    chunks.append({
                        "text": current_table_chunk.strip(),
                        "page_number_range": page_range,
                        "contains_table": True,
                        "table_count": 1,
                    })
            else:
                # Table fits in a chunk
                current_text = segment["text"]
                current_pages = {segment["page_number"]}
                current_has_table = True
                current_table_count = 1
                _flush_chunk()
        else:
            # Regular text — accumulate until chunk size
            combined = (current_text + "\n\n" + segment["text"]).strip() if current_text else segment["text"]
            if _count_tokens(combined) > CHUNK_SIZE_TOKENS:
                _flush_chunk()
                current_text = segment["text"]
                current_pages = {segment["page_number"]}
            else:
                current_text = combined
                current_pages.add(segment["page_number"])

    # Flush remaining
    _flush_chunk()

    # Assign metadata
    now = datetime.now(timezone.utc).isoformat()
    total_chunks = len(chunks)
    result: list[dict[str, Any]] = []

    for idx, chunk in enumerate(chunks):
        chunk_id = f"{doc_id}_chunk_{idx:04d}"
        taxonomy = _infer_taxonomy(file_name)
        result.append({
            "text": chunk["text"],
            "metadata": {
                "doc_id": doc_id,
                "file_name": file_name,
                "chunk_id": chunk_id,
                "page_number_range": chunk["page_number_range"],
                "contains_table": chunk["contains_table"],
                "table_count": chunk["table_count"],
                "chunk_index": idx,
                "total_chunks_in_doc": total_chunks,
                "version": VERSION,
                "ingestion_timestamp": now,
                "source_type": SOURCE_TYPE,
                "document_type": DOCUMENT_TYPE,
                **taxonomy,
            },
        })

    return result


def chunk_all_documents(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Chunk all documents, grouping pages by doc_id."""
    # Group pages by doc_id
    sorted_pages = sorted(pages, key=lambda p: p["doc_id"])
    all_chunks: list[dict[str, Any]] = []

    for doc_id, doc_pages_iter in groupby(sorted_pages, key=lambda p: p["doc_id"]):
        doc_pages = list(doc_pages_iter)
        file_name = doc_pages[0]["file_name"]
        logger.info(f"Chunking {file_name} ({len(doc_pages)} pages)")

        doc_chunks = chunk_single_document(doc_pages, doc_id, file_name)
        all_chunks.extend(doc_chunks)

    # Save to JSON
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(CHUNKED_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2, ensure_ascii=False)

    logger.info(f"Saved {len(all_chunks)} chunks to {CHUNKED_DATA_PATH}")
    return all_chunks
