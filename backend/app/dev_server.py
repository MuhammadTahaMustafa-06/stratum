"""
Local dev entrypoint: same as `python -m uvicorn app.main:app --reload ...` but quieter logs.

- Downgrades WatchFiles "detected changes … Reloading" from WARNING to INFO (normal behavior, not an error).
- Sets NUMEXPR_MAX_THREADS / Windows console handler before any worker import.

Run from `backend/`:
  python -m app.dev_server
"""
from __future__ import annotations

import logging
import os

os.environ.setdefault("NUMEXPR_MAX_THREADS", "8")
if os.name == "nt":
    os.environ.setdefault("FOR_DISABLE_CONSOLE_CTRL_HANDLER", "1")


class _ReloadLogFilter(logging.Filter):
    """Uvicorn logs file-watch reloads at WARNING; that is expected, not a failure."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno == logging.WARNING and record.name == "uvicorn.error":
            msg = record.getMessage()
            if "detected changes in" in msg and "Reloading" in msg:
                record.levelno = logging.INFO
                record.levelname = "INFO"
        return True


def main() -> None:
    logging.getLogger("uvicorn.error").addFilter(_ReloadLogFilter())
    logging.getLogger("numexpr.utils").setLevel(logging.WARNING)

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_delay=0.75,
        reload_dirs=["app", "ingestion"],
    )


if __name__ == "__main__":
    main()
