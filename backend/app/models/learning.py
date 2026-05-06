import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_team: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(32), default="beginner")
    estimated_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_onboarding: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    items: Mapped[list["LearningPathItem"]] = relationship(
        "LearningPathItem", back_populates="path", cascade="all, delete-orphan", order_by="LearningPathItem.position"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "target_role": self.target_role,
            "target_team": self.target_team,
            "difficulty": self.difficulty,
            "estimated_hours": self.estimated_hours,
            "is_onboarding": self.is_onboarding,
            "is_published": self.is_published,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "item_count": len(self.items) if self.items else 0,
        }


class LearningPathItem(Base):
    __tablename__ = "learning_path_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    path_id: Mapped[str] = mapped_column(String(36), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False)
    article_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("articles.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resource_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    item_type: Mapped[str] = mapped_column(String(32), default="article")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)

    path: Mapped["LearningPath"] = relationship("LearningPath", back_populates="items")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "path_id": self.path_id,
            "article_id": self.article_id,
            "title": self.title,
            "description": self.description,
            "resource_url": self.resource_url,
            "item_type": self.item_type,
            "position": self.position,
            "is_required": self.is_required,
        }


class UserProgress(Base):
    __tablename__ = "user_progress"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    path_id: Mapped[str] = mapped_column(String(36), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("learning_path_items.id", ondelete="SET NULL"), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
