"""
Step 1 — PDF Extraction Module
Extracts text and tables from PDFs using pdfplumber.
Converts tables into structured + LLM-friendly text format.
"""

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import pdfplumber

from ingestion.config import PDF_DIR, PAGE_LEVEL_DATA_PATH, PROCESSED_DIR

logger = logging.getLogger(__name__)


def _generate_doc_id(file_path: Path) -> str:
    """Generate a deterministic document ID from the file path."""
    return hashlib.md5(file_path.name.encode("utf-8")).hexdigest()[:12]


def _clean_cell(cell: Any) -> str:
    """Safely convert a table cell to a cleaned string."""
    if cell is None:
        return ""
    return str(cell).strip().replace("\n", " ")


def _deduplicate_header_rows(table: list[list[str]]) -> list[list[str]]:
    """Remove duplicate header rows (identical to the first row)."""
    if len(table) <= 1:
        return table
    header = table[0]
    cleaned = [header]
    for row in table[1:]:
        if row != header:
            cleaned.append(row)
    return cleaned


def _table_to_text(table: list[list[str]], table_index: int) -> str:
    """
    Convert a structured table into LLM-friendly text.

    Example output:
        Table 1: Loan Interest Details.
        Row 1: Loan Type = Home Loan, Interest Rate = 8.5%, Tenure = 20 years.
    """
    if not table or len(table) < 2:
        return ""

    headers = table[0]
    lines: list[str] = []

    # Try to create a meaningful table title from headers
    header_text = ", ".join(h for h in headers if h)
    lines.append(f"Table {table_index + 1}: {header_text}.")

    for row_idx, row in enumerate(table[1:], start=1):
        parts: list[str] = []
        for col_idx, cell in enumerate(row):
            col_name = headers[col_idx] if col_idx < len(headers) else f"Column {col_idx + 1}"
            cell_val = cell if cell else "N/A"
            parts.append(f"{col_name} = {cell_val}")
        lines.append(f"Row {row_idx}: {', '.join(parts)}.")

    return "\n".join(lines)


def extract_single_pdf(pdf_path: Path) -> list[dict[str, Any]]:
    """Extract text and tables from a single PDF, returning page-level data."""
    doc_id = _generate_doc_id(pdf_path)
    pages_data: list[dict[str, Any]] = []

    logger.info(f"Extracting: {pdf_path.name}")

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

        for page_num, page in enumerate(pdf.pages, start=1):
            # ── Extract text ────────────────────────────────────────
            text_content = page.extract_text() or ""

            # ── Extract tables ──────────────────────────────────────
            raw_tables = page.extract_tables() or []
            tables_data: list[dict[str, Any]] = []

            for t_idx, raw_table in enumerate(raw_tables):
                # Clean every cell
                cleaned_table = [
                    [_clean_cell(cell) for cell in row]
                    for row in raw_table
                ]
                # Remove duplicate header rows
                cleaned_table = _deduplicate_header_rows(cleaned_table)
                # Convert to LLM-friendly text
                table_text = _table_to_text(cleaned_table, t_idx)

                tables_data.append({
                    "table_index": t_idx,
                    "raw_table": cleaned_table,
                    "table_text": table_text,
                })

            pages_data.append({
                "doc_id": doc_id,
                "file_name": pdf_path.name,
                "page_number": page_num,
                "total_pages": total_pages,
                "text_content": text_content,
                "tables": tables_data,
            })

    logger.info(f"  → {total_pages} pages, {sum(len(p['tables']) for p in pages_data)} tables")
    return pages_data


def extract_all_pdfs(pdf_dir: Path | None = None) -> list[dict[str, Any]]:
    """Extract text and tables from all PDFs in the directory."""
    pdf_dir = pdf_dir or PDF_DIR
    pdf_files = sorted(pdf_dir.glob("*.pdf"))

    if not pdf_files:
        logger.warning(f"No PDF files found in {pdf_dir}")
        return []

    logger.info(f"Found {len(pdf_files)} PDF(s) in {pdf_dir}")

    all_pages: list[dict[str, Any]] = []
    for pdf_path in pdf_files:
        try:
            pages = extract_single_pdf(pdf_path)
            all_pages.extend(pages)
        except Exception as e:
            logger.error(f"Failed to extract {pdf_path.name}: {e}")
            continue

    # Save to JSON
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(PAGE_LEVEL_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(all_pages, f, indent=2, ensure_ascii=False)

    logger.info(f"Saved {len(all_pages)} pages to {PAGE_LEVEL_DATA_PATH}")
    return all_pages
