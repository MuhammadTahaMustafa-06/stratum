"""SQLAlchemy engine and session factory for PostgreSQL."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.connect import libpq_connect_args


def _postgres_database_url() -> str:
    """Validate and return DATABASE_URL (PostgreSQL)."""
    url = (settings.database_url or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. Use postgresql+psycopg2://… with sslmode=require as needed "
            "(e.g. Neon dashboard connection string)."
        )
    lower = url.lower()
    if lower.startswith("sqlite"):
        raise RuntimeError("SQLite is not supported. Use PostgreSQL for DATABASE_URL.")
    if not (lower.startswith("postgresql") or lower.startswith("postgres://")):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL (postgresql:// or postgresql+psycopg2://).")
    return url


def _create_engine():
    url = _postgres_database_url()
    return create_engine(url, connect_args=libpq_connect_args(url))


engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
