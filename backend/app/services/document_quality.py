"""Heuristic PDF checks for text RAG (extractability, density). Uses pdfplumber only."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pdfplumber

Tier = Literal["ok", "warn", "fail"]


@dataclass(frozen=True)
class PdfQualityResult:
    tier: Tier
    page_count: int
    extractable_chars: int
    messages: list[str]


def _classify(page_count: int, chars: int) -> tuple[Tier, list[str]]:
    msgs: list[str] = []
    if page_count <= 0:
        return "fail", ["Could not read pages from this PDF."]
    if chars < 80:
        return (
            "fail",
            [
                "Almost no extractable text. For RAG this usually means a scanned PDF, "
                "corrupt file, or pages that are images only. Use OCR (for example ocrmypdf) "
                "before ingest, or replace with a text-based export.",
            ],
        )
    per_page = chars / page_count
    if chars < 500:
        msgs.append("Very little text overall; chunks may be thin or empty after cleaning.")
    if per_page < 60:
        msgs.append("Low text per page — common for slide decks, scans, or diagram-heavy PDFs.")
    if 500 <= chars < 1500:
        msgs.append("Short document; confirm it matches the intended knowledge domain.")
    if msgs:
        return "warn", msgs
    return "ok", []


def assess_pdf_for_rag(path: Path) -> PdfQualityResult:
    """
    Open the saved PDF and measure how much text extraction yields.

    This does not judge topical relevance (that needs taxonomy, eval sets, or human review);
    it flags PDFs that are unlikely to work well in a text embedding + BM25 pipeline.
    """
    path = Path(path)
    try:
        with pdfplumber.open(path) as pdf:
            page_count = len(pdf.pages)
            total = 0
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    total += len(text.strip())
    except Exception as exc:  # noqa: BLE001 — surface any parse failure
        return PdfQualityResult(
            tier="fail",
            page_count=0,
            extractable_chars=0,
            messages=[f"PDF parse error: {exc!s}"],
        )

    tier, messages = _classify(page_count, total)
    return PdfQualityResult(tier=tier, page_count=page_count, extractable_chars=total, messages=messages)
