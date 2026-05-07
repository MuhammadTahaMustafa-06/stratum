"""
Step 2 — Cleaning & Normalization Module
Cleans extracted page data: removes whitespace, empty pages, normalizes tables,
and merges text + table_text into unified page content.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def _normalize_whitespace(text: str) -> str:
    """Collapse multiple whitespace/newlines into clean formatting."""
    # Replace multiple spaces with single space
    text = re.sub(r"[ \t]+", " ", text)
    # Replace 3+ newlines with double newline
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_table_text(table_text: str) -> str:
    """Normalize table text formatting for consistency."""
    # Clean up spacing around equals signs
    table_text = re.sub(r"\s*=\s*", " = ", table_text)
    # Clean up spacing around commas
    table_text = re.sub(r"\s*,\s*", ", ", table_text)
    return table_text.strip()


def _is_empty_page(page: dict[str, Any]) -> bool:
    """Check if a page has no meaningful content."""
    text = (page.get("text_content") or "").strip()
    tables = page.get("tables") or []
    has_table_text = any(
        (t.get("table_text") or "").strip() for t in tables
    )
    return not text and not has_table_text


def clean_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Clean and normalize all page data."""
    cleaned: list[dict[str, Any]] = []

    for page in pages:
        # Skip empty pages
        if _is_empty_page(page):
            logger.debug(
                f"Skipping empty page {page.get('page_number')} "
                f"from {page.get('file_name')}"
            )
            continue

        # Clean text content
        page["text_content"] = _normalize_whitespace(page.get("text_content") or "")

        # Clean table text
        for table in page.get("tables", []):
            table["table_text"] = _normalize_table_text(table.get("table_text") or "")

        cleaned.append(page)

    removed = len(pages) - len(cleaned)
    if removed:
        logger.info(f"Removed {removed} empty pages")
    logger.info(f"Cleaned {len(cleaned)} pages")

    return cleaned


def merge_text_and_tables(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Merge each page's text_content and table_text into a unified_content field.

    Format:
        [Normal Page Text]

        [Extracted Table Converted To Text]
    """
    for page in pages:
        parts: list[str] = []

        # Add page text
        text = (page.get("text_content") or "").strip()
        if text:
            parts.append(text)

        # Add each table's text
        for table in page.get("tables", []):
            table_text = (table.get("table_text") or "").strip()
            if table_text:
                parts.append(table_text)

        page["unified_content"] = "\n\n".join(parts)

    logger.info(f"Merged text + tables for {len(pages)} pages")
    return pages
