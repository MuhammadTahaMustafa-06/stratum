import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExpertProfile(Base):
    __tablename__ = "expert_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    domains: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    systems: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    skills: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    availability: Mapped[str] = mapped_column(String(32), default="available")
    contact_preference: Mapped[str] = mapped_column(String(64), default="slack")
    articles_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def domains_list(self) -> list[str]:
        return [d.strip() for d in (self.domains or "").split(",") if d.strip()]

    def systems_list(self) -> list[str]:
        return [s.strip() for s in (self.systems or "").split(",") if s.strip()]

    def skills_list(self) -> list[str]:
        return [s.strip() for s in (self.skills or "").split(",") if s.strip()]

    def to_dict(self, user=None) -> dict:
        base = {
            "id": self.id,
            "user_id": self.user_id,
            "domains": self.domains_list(),
            "systems": self.systems_list(),
            "skills": self.skills_list(),
            "availability": self.availability,
            "contact_preference": self.contact_preference,
            "articles_count": self.articles_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if user:
            base["full_name"] = user.full_name
            base["email"] = user.email
            base["team"] = user.team
            base["department"] = user.department
            base["avatar_url"] = user.avatar_url
            base["bio"] = user.bio
        return base
