import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DeletedUser(Base):
    __tablename__ = "deleted_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    neon_auth_sub: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    deleted_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
