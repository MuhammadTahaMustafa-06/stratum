import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    # ── Identity ──────────────────────────────────────────────────────────────
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False, index=True, default="employee")
    team: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    expertise_tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── MFA (TOTP) ────────────────────────────────────────────────────────────
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    mfa_backup_codes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of hashed codes
    mfa_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Account lockout (brute-force protection) ───────────────────────────────
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Session management (refresh tokens) ───────────────────────────────────
    refresh_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # ── Neon Auth JWT subject (`sub`) — links OAuth / Neon-managed accounts ──
    neon_auth_sub: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def expertise_list(self) -> list[str]:
        if not self.expertise_tags:
            return []
        return [t.strip() for t in self.expertise_tags.split(",") if t.strip()]

    def is_locked(self) -> bool:
        if self.locked_until is None:
            return False
        return datetime.now(timezone.utc) < self.locked_until

    def backup_code_hashes(self) -> list[str]:
        if not self.mfa_backup_codes:
            return []
        import json
        try:
            return json.loads(self.mfa_backup_codes)
        except Exception:
            return []
