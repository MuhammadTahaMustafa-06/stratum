"""
Banking RAG Ingestion Pipeline — Entry Point
Runs the LangGraph pipeline: extract → clean → merge → chunk → embed → ChromaDB.
"""

import argparse
import logging
import sys
import time
from pathlib import Path

from ingestion.config import PDF_DIR, PROCESSED_DIR


def _setup_logging(verbose: bool = False) -> None:
    """Configure structured logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    # Suppress noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Banking RAG Ingestion Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                    # Run with defaults
  python main.py --pdf-dir ./pdfs   # Custom PDF directory
  python main.py --verbose          # Debug logging
        """,
    )
    parser.add_argument(
        "--pdf-dir",
        type=str,
        default=None,
        help=f"PDF directory (default: {PDF_DIR})",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    _setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    pdf_dir = Path(args.pdf_dir) if args.pdf_dir else PDF_DIR

    if not pdf_dir.exists():
        logger.error(f"PDF directory not found: {pdf_dir}")
        sys.exit(1)

    pdf_count = len(list(pdf_dir.glob("*.pdf")))
    if pdf_count == 0:
        logger.error(f"No PDF files found in {pdf_dir}")
        sys.exit(1)

    # Ensure output directory exists
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    logger.info(f"PDF directory : {pdf_dir} ({pdf_count} files)")
    logger.info(f"Output dir    : {PROCESSED_DIR}")

    # Run pipeline
    from ingestion.pipeline.pipeline import run_pipeline

    start = time.time()
    final_state = run_pipeline(pdf_dir)
    elapsed = time.time() - start

    # Summary
    stats = final_state.get("stats", {})
    errors = final_state.get("errors", [])

    print("\n" + "=" * 50)
    print("  PIPELINE SUMMARY")
    print("=" * 50)

    if stats.get("skipped"):
        print("  SKIP No new/changed files - skipped")
    else:
        print(f"  Documents   : {stats.get('total_documents', '?')}")
        print(f"  Pages       : {stats.get('total_pages_extracted', '?')}")
        print(f"  Chunks      : {stats.get('total_chunks', '?')}")
        print(f"  Table chunks: {stats.get('chunks_with_tables', '?')}")
        print(f"  Embeddings  : {stats.get('embeddings_generated', '?')}")
        print(f"  Chroma recs : {stats.get('chroma_records_stored', '?')}")
        print(f"  Time        : {elapsed:.1f}s")

    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for err in errors:
            print(f"    - {err}")

    print("=" * 50 + "\n")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
