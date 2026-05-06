"""PDF quality heuristics for RAG ingest (pure unit tests + optional sample file)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.document_quality import PdfQualityResult, _classify, assess_pdf_for_rag

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_SAMPLE_PDF = _BACKEND_ROOT / "data" / "raw" / "KM-02-Core-Banking-Glossary.pdf"


def test_classify_ok_dense_text() -> None:
    tier, msgs = _classify(page_count=5, chars=8000)
    assert tier == "ok"
    assert msgs == []


def test_classify_fail_no_text() -> None:
    tier, msgs = _classify(page_count=3, chars=10)
    assert tier == "fail"
    assert msgs


def test_classify_warn_sparse() -> None:
    tier, msgs = _classify(page_count=10, chars=400)
    assert tier == "warn"
    assert msgs


def test_classify_warn_short_doc_moderate_chars() -> None:
    """500 <= chars < 1500 adds a warning message (still warn tier if any msgs)."""
    tier, msgs = _classify(page_count=4, chars=800)
    assert tier == "warn"
    assert msgs


@pytest.mark.skipif(not _SAMPLE_PDF.exists(), reason="sample KM PDF not in tree")
def test_assess_sample_km_pdf() -> None:
    r = assess_pdf_for_rag(_SAMPLE_PDF)
    assert isinstance(r, PdfQualityResult)
    assert r.page_count >= 1
    assert r.extractable_chars > 200
    assert r.tier in ("ok", "warn")
