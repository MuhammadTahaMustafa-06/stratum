import pytest

from app.services.knowledge_reconciliation import classify_situation, normalize_pdf_key


@pytest.mark.parametrize(
    "has_article,in_index,has_raw,in_registry,expected",
    [
        (True, True, True, False, "in_sync"),
        (True, True, False, False, "portal_indexed_missing_raw"),
        (True, False, True, False, "portal_not_indexed"),
        (True, False, False, False, "orphan_article"),
        (False, True, True, False, "rag_only"),
        (False, True, False, False, "vectors_missing_raw"),
        (False, False, True, False, "raw_only"),
        (False, False, False, True, "registry_only"),
    ],
)
def test_classify_situation(has_article, in_index, has_raw, in_registry, expected):
    assert classify_situation(has_article, in_index, has_raw, in_registry) == expected


def test_normalize_pdf_key_strips_paths():
    assert normalize_pdf_key("  folder/sub/My-Doc.PDF  ") == "my-doc.pdf"
