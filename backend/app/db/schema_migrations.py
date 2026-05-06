"""
Lightweight additive migrations for existing DBs (no Alembic required).
Safe to run repeatedly.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)


def run_light_migrations(engine: Engine) -> None:
    try:
        insp = inspect(engine)
        tables = insp.get_table_names()
    except Exception as e:
        log.warning("Schema inspection skipped: %s", e)
        return

    if "users" not in tables:
        return

    _rename_legacy_neon_auth_column(engine)

    # Additive columns for older DBs / manual schemas (create_all does not ALTER existing tables).
    _USER_ALTER_IF_MISSING = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS neon_auth_sub VARCHAR(128)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(32)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise_tags TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
        # MFA + lockout + refresh — login returned 500 when ORM wrote missing columns
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0 NOT NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(128)",
    ]

    with engine.begin() as conn:
        for stmt in _USER_ALTER_IF_MISSING:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                log.warning("users column migration: %s", e)

    _ensure_partial_unique_neon_auth_sub(engine)


def _rename_legacy_neon_auth_column(engine: Engine) -> None:
    """Rename removed ``supabase_sub`` column to ``neon_auth_sub`` when present."""
    stmt = text(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'supabase_sub'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'neon_auth_sub'
          ) THEN
            ALTER TABLE users RENAME COLUMN supabase_sub TO neon_auth_sub;
          END IF;
        END $$;
        """
    )
    try:
        with engine.begin() as conn:
            conn.execute(stmt)
    except Exception as e:
        log.warning("users column rename (supabase_sub → neon_auth_sub): %s", e)


def _ensure_partial_unique_neon_auth_sub(engine: Engine) -> None:
    """One external Neon Auth subject per row (NULL allowed multiple)."""
    drop_old = text("DROP INDEX IF EXISTS uq_users_supabase_sub")
    stmt = (
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_neon_auth_sub "
        "ON users (neon_auth_sub) WHERE neon_auth_sub IS NOT NULL"
    )
    try:
        with engine.begin() as conn:
            conn.execute(drop_old)
            conn.execute(text(stmt))
    except Exception as e:
        log.debug("Partial unique index on neon_auth_sub: %s", e)
