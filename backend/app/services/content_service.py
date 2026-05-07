"""
DB-backed content service replacing the legacy JSON file store.
All article, learning-path, expert, and bookmark operations go through SQLAlchemy.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.article import Article, ArticleVersion
from app.models.learning import LearningPath, LearningPathItem, UserProgress
from app.models.expert import ExpertProfile
from app.models.bookmark import Bookmark
from app.models.analytics import QueryLog, Feedback
from app.models.user import User


# ─── Articles ───────────────────────────────────────────────────────────────

class ContentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Article helpers ---

    def _article_to_dict(self, a: Article) -> dict[str, Any]:
        return a.to_dict()

    def _articles_filtered_query(
        self,
        *,
        q: Optional[str] = None,
        domain: Optional[str] = None,
        status: Optional[str] = None,
        team: Optional[str] = None,
    ):
        query = self.db.query(Article)
        if domain:
            query = query.filter(Article.domain == domain)
        if status:
            query = query.filter(Article.status == status)
        if team:
            query = query.filter(Article.team == team)
        if q:
            q_lower = f"%{q.lower()}%"
            query = query.filter(
                Article.title.ilike(q_lower) | Article.content.ilike(q_lower)
            )
        return query

    def count_articles(
        self,
        *,
        q: Optional[str] = None,
        domain: Optional[str] = None,
        status: Optional[str] = None,
        team: Optional[str] = None,
    ) -> int:
        return int(self._articles_filtered_query(q=q, domain=domain, status=status, team=team).count())

    def list_articles(
        self,
        *,
        q: Optional[str] = None,
        domain: Optional[str] = None,
        status: Optional[str] = None,
        team: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        query = self._articles_filtered_query(q=q, domain=domain, status=status, team=team)
        query = query.order_by(Article.updated_at.desc()).limit(limit).offset(offset)
        return [self._article_to_dict(a) for a in query.all()]

    def get_article(self, article_id: str) -> Optional[dict[str, Any]]:
        a = self.db.query(Article).filter(Article.id == article_id).first()
        if not a:
            return None
        a.view_count = (a.view_count or 0) + 1
        self.db.commit()
        return self._article_to_dict(a)

    def get_article_status(self, article_id: str) -> Optional[str]:
        """Current workflow status without side effects (no view_count bump)."""
        a = self.db.query(Article).filter(Article.id == article_id).first()
        return a.status if a else None

    def create_article(self, payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
        tags = payload.get("tags", [])
        tags_str = ",".join(tags) if isinstance(tags, list) else (tags or "")
        a = Article(
            title=payload["title"],
            content=payload["content"],
            summary=payload.get("summary"),
            domain=payload.get("domain", "general"),
            tags=tags_str,
            team=payload.get("team"),
            system_name=payload.get("system_name"),
            process_type=payload.get("process_type"),
            expires_at=payload.get("expires_at"),
            author_id=actor_id,
            status="draft",
        )
        self.db.add(a)
        self.db.commit()
        self.db.refresh(a)
        self._save_version(a, actor_id, "created")
        return self._article_to_dict(a)

    def update_article(self, article_id: str, updates: dict[str, Any], actor_id: str) -> Optional[dict[str, Any]]:
        a = self.db.query(Article).filter(Article.id == article_id).first()
        if not a:
            return None
        for key, value in updates.items():
            if key == "tags" and isinstance(value, list):
                value = ",".join(value)
            if hasattr(a, key):
                setattr(a, key, value)
        a.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(a)
        self._save_version(a, actor_id, "updated")
        return self._article_to_dict(a)

    def transition_status(
        self, article_id: str, status: str, actor_id: str, comment: str = ""
    ) -> Optional[dict[str, Any]]:
        a = self.db.query(Article).filter(Article.id == article_id).first()
        if not a:
            return None
        a.status = status
        a.updated_at = datetime.now(timezone.utc)
        if status == "published":
            a.published_at = datetime.now(timezone.utc)
            a.reviewer_id = actor_id
            a.archived_at = None
        elif status == "archived":
            a.archived_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(a)
        self._save_version(a, actor_id, f"status:{status}", comment)
        return self._article_to_dict(a)

    def delete_article(self, article_id: str) -> bool:
        a = self.db.query(Article).filter(Article.id == article_id).first()
        if not a:
            return False
        self.db.delete(a)
        self.db.commit()
        return True

    def _save_version(self, article: Article, actor_id: str, note: str, comment: str = "") -> None:
        count = self.db.query(ArticleVersion).filter(ArticleVersion.article_id == article.id).count()
        v = ArticleVersion(
            article_id=article.id,
            version_number=count + 1,
            title=article.title,
            content=article.content,
            changed_by=actor_id,
            change_note=f"{note}: {comment}" if comment else note,
        )
        self.db.add(v)
        self.db.commit()

    # --- Learning Paths ---

    def list_learning_paths(
        self, *, published_only: bool = True, role: Optional[str] = None
    ) -> list[dict[str, Any]]:
        query = self.db.query(LearningPath)
        if published_only:
            query = query.filter(LearningPath.is_published)
        if role:
            query = query.filter(
                or_(LearningPath.target_role == role, LearningPath.target_role.is_(None))
            )
        return [p.to_dict() for p in query.order_by(LearningPath.is_onboarding.desc(), LearningPath.created_at).all()]

    def get_learning_path(self, path_id: str, user_id: Optional[str] = None) -> Optional[dict[str, Any]]:
        p = self.db.query(LearningPath).filter(LearningPath.id == path_id).first()
        if not p:
            return None
        data = p.to_dict()
        data["items"] = [i.to_dict() for i in p.items]

        if user_id and p.items:
            total = len(p.items)
            completed = (
                self.db.query(UserProgress)
                .filter(
                    UserProgress.user_id == user_id,
                    UserProgress.path_id == path_id,
                    UserProgress.completed,
                )
                .count()
            )
            data["enrolled"] = (
                self.db.query(UserProgress)
                .filter(UserProgress.user_id == user_id, UserProgress.path_id == path_id)
                .first()
            ) is not None
            data["progress_pct"] = round(completed / total * 100, 1) if total else 0.0

            completed_ids = {
                r.item_id
                for r in self.db.query(UserProgress)
                .filter(
                    UserProgress.user_id == user_id,
                    UserProgress.path_id == path_id,
                    UserProgress.completed,
                )
                .all()
            }
            for item_dict in data["items"]:
                item_dict["completed"] = item_dict["id"] in completed_ids

        return data

    def create_learning_path(self, payload: dict[str, Any], actor_id: str) -> dict[str, Any]:
        items_data = payload.pop("items", []) or []
        p = LearningPath(**{k: v for k, v in payload.items() if hasattr(LearningPath, k)}, created_by=actor_id)
        self.db.add(p)
        self.db.flush()
        for i, item in enumerate(items_data):
            item["path_id"] = p.id
            item.setdefault("position", i)
            self.db.add(LearningPathItem(**{k: v for k, v in item.items() if hasattr(LearningPathItem, k)}))
        self.db.commit()
        self.db.refresh(p)
        return p.to_dict()

    def enroll_user(self, path_id: str, user_id: str) -> bool:
        existing = (
            self.db.query(UserProgress)
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.path_id == path_id,
                UserProgress.item_id.is_(None),
            )
            .first()
        )
        if existing:
            return False
        self.db.add(UserProgress(user_id=user_id, path_id=path_id))
        self.db.commit()
        return True

    def update_progress(self, path_id: str, item_id: str, user_id: str, completed: bool) -> bool:
        row = (
            self.db.query(UserProgress)
            .filter(UserProgress.user_id == user_id, UserProgress.path_id == path_id, UserProgress.item_id == item_id)
            .first()
        )
        if not row:
            row = UserProgress(user_id=user_id, path_id=path_id, item_id=item_id)
            self.db.add(row)
        row.completed = completed
        row.completed_at = datetime.now(timezone.utc) if completed else None
        self.db.commit()
        return True

    # --- Experts ---

    def list_experts(self, *, domain: Optional[str] = None) -> list[dict[str, Any]]:
        query = self.db.query(ExpertProfile)
        results = []
        for ep in query.all():
            if domain and domain.lower() not in [d.lower() for d in ep.domains_list()]:
                continue
            user = self.db.query(User).filter(User.id == ep.user_id).first()
            results.append(ep.to_dict(user=user))
        return results

    def upsert_expert(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        ep = self.db.query(ExpertProfile).filter(ExpertProfile.user_id == user_id).first()
        if not ep:
            ep = ExpertProfile(user_id=user_id)
            self.db.add(ep)
        ep.domains = ",".join(payload.get("domains", []))
        ep.systems = ",".join(payload.get("systems", []))
        ep.skills = ",".join(payload.get("skills", []))
        ep.availability = payload.get("availability", "available")
        ep.contact_preference = payload.get("contact_preference", "slack")
        ep.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(ep)
        user = self.db.query(User).filter(User.id == user_id).first()
        return ep.to_dict(user=user)

    # --- Bookmarks ---

    def list_bookmarks(self, user_id: str) -> list[dict[str, Any]]:
        rows = self.db.query(Bookmark).filter(Bookmark.user_id == user_id).order_by(Bookmark.created_at.desc()).all()
        result = []
        for b in rows:
            a = self.db.query(Article).filter(Article.id == b.article_id).first()
            result.append({
                "id": b.id,
                "article_id": b.article_id,
                "article_title": a.title if a else None,
                "article_domain": a.domain if a else None,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            })
        return result

    def add_bookmark(self, user_id: str, article_id: str) -> dict[str, Any]:
        existing = (
            self.db.query(Bookmark)
            .filter(Bookmark.user_id == user_id, Bookmark.article_id == article_id)
            .first()
        )
        if existing:
            a = self.db.query(Article).filter(Article.id == article_id).first()
            return {
                "id": existing.id,
                "article_id": article_id,
                "article_title": a.title if a else None,
                "article_domain": a.domain if a else None,
                "created_at": existing.created_at.isoformat() if existing.created_at else None,
            }
        b = Bookmark(user_id=user_id, article_id=article_id)
        self.db.add(b)
        self.db.commit()
        self.db.refresh(b)
        a = self.db.query(Article).filter(Article.id == article_id).first()
        return {
            "id": b.id,
            "article_id": article_id,
            "article_title": a.title if a else None,
            "article_domain": a.domain if a else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }

    def remove_bookmark(self, user_id: str, article_id: str) -> bool:
        b = (
            self.db.query(Bookmark)
            .filter(Bookmark.user_id == user_id, Bookmark.article_id == article_id)
            .first()
        )
        if not b:
            return False
        self.db.delete(b)
        self.db.commit()
        return True

    # --- Query Logging ---

    def log_query(
        self,
        user_id: Optional[str],
        query_text: str,
        query_type: str,
        result_count: int,
        answered: bool,
        domain_filter: Optional[str] = None,
        latency_ms: Optional[int] = None,
        top_sources: Optional[list[str]] = None,
    ) -> None:
        log = QueryLog(
            user_id=user_id,
            query_text=query_text,
            query_type=query_type,
            result_count=result_count,
            answered=answered,
            domain_filter=domain_filter,
            latency_ms=latency_ms,
            top_sources=",".join(top_sources) if top_sources else None,
        )
        self.db.add(log)
        self.db.commit()

    def save_feedback(
        self,
        user_id: Optional[str],
        query_text: str,
        answer_text: Optional[str],
        rating: int,
        comment: Optional[str],
        sources: Optional[list[str]],
    ) -> None:
        f = Feedback(
            user_id=user_id,
            query_text=query_text,
            answer_text=answer_text,
            rating=rating,
            comment=comment,
            sources=",".join(sources) if sources else None,
        )
        self.db.add(f)
        self.db.commit()

    def list_admin_feedback(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        rating: Optional[int] = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Paginated list of user feedback for Knowledge Admins."""
        query = self.db.query(Feedback)
        if rating is not None:
            query = query.filter(Feedback.rating == rating)
        total = query.count()
        rows = query.order_by(Feedback.created_at.desc()).offset(offset).limit(limit).all()

        user_ids = {r.user_id for r in rows if r.user_id}
        emails: dict[str, str] = {}
        if user_ids:
            for u in self.db.query(User).filter(User.id.in_(user_ids)).all():
                emails[str(u.id)] = u.email or ""

        items = []
        for r in rows:
            uid = str(r.user_id) if r.user_id else None
            items.append({
                "id": r.id,
                "user_id": uid,
                "user_email": emails.get(uid) if uid else None,
                "query_text": r.query_text,
                "answer_text": r.answer_text,
                "rating": r.rating,
                "comment": r.comment,
                "sources": r.sources.split(",") if r.sources else [],
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        return total, items

    # --- Analytics ---

    def analytics_summary(self) -> dict[str, Any]:
        from sqlalchemy import func
        total_articles = self.db.query(Article).count()
        status_rows = self.db.query(Article.status, func.count(Article.id)).group_by(Article.status).all()
        status_breakdown = dict(status_rows)

        threshold = datetime.now(timezone.utc) + timedelta(days=30)
        expiring_soon = (
            self.db.query(Article)
            .filter(
                Article.expires_at.isnot(None),
                Article.expires_at <= threshold,
                Article.status == "published",
            )
            .count()
        )

        total_queries = self.db.query(QueryLog).count()
        unanswered = self.db.query(QueryLog).filter(QueryLog.answered.is_(False)).count()

        helpful = self.db.query(Feedback).filter(Feedback.rating == 1).count()
        not_helpful = self.db.query(Feedback).filter(Feedback.rating == -1).count()

        # Top knowledge gaps = unanswered queries grouped by text similarity (simple frequency)
        from sqlalchemy import func as sqlfunc
        gap_rows = (
            self.db.query(QueryLog.query_text, sqlfunc.count(QueryLog.id).label("cnt"), sqlfunc.max(QueryLog.created_at).label("last"))
            .filter(QueryLog.answered.is_(False))
            .group_by(QueryLog.query_text)
            .order_by(sqlfunc.count(QueryLog.id).desc())
            .limit(10)
            .all()
        )
        gaps = [{"query": r.query_text, "count": r.cnt, "last_seen": r.last.isoformat() if r.last else None} for r in gap_rows]

        total_paths = self.db.query(LearningPath).filter(LearningPath.is_published).count()
        total_experts = self.db.query(ExpertProfile).count()

        total_gaps = self.db.query(QueryLog.query_text).filter(QueryLog.answered.is_(False)).distinct().count()

        return {
            "total_articles": total_articles,
            "status_breakdown": status_breakdown,
            "expiring_soon_count": expiring_soon,
            "total_queries": total_queries,
            "unanswered_queries": unanswered,
            "helpful_feedback": helpful,
            "not_helpful_feedback": not_helpful,
            "top_knowledge_gaps": gaps,
            "total_knowledge_gaps": total_gaps,
            "total_learning_paths": total_paths,
            "total_experts": total_experts,
        }

    def list_admin_query_logs(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        answered: Optional[bool] = None,
        query_type: Optional[str] = None,
        q: Optional[str] = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Paginated chat/search query logs for admin (RAG activity)."""
        query = self.db.query(QueryLog)
        if answered is not None:
            query = query.filter(QueryLog.answered == answered)
        if query_type:
            query = query.filter(QueryLog.query_type == query_type.strip().lower()[:32])
        if q and q.strip():
            query = query.filter(QueryLog.query_text.ilike(f"%{q.strip()}%"))
        total = query.count()
        rows = (
            query.order_by(QueryLog.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        user_ids = {r.user_id for r in rows if r.user_id}
        emails: dict[str, str] = {}
        if user_ids:
            for u in self.db.query(User).filter(User.id.in_(user_ids)).all():
                emails[str(u.id)] = u.email or ""
        items: list[dict[str, Any]] = []
        for r in rows:
            uid = str(r.user_id) if r.user_id else None
            items.append(
                {
                    "id": r.id,
                    "user_id": uid,
                    "user_email": emails.get(uid) if uid else None,
                    "query_text": r.query_text,
                    "query_type": r.query_type,
                    "domain_filter": r.domain_filter,
                    "result_count": r.result_count,
                    "answered": r.answered,
                    "latency_ms": r.latency_ms,
                    "created_at": r.created_at,
                }
            )
        return total, items

    def list_admin_audit_events(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        q: Optional[str] = None,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Article version history (content lifecycle audit trail)."""
        query = self.db.query(ArticleVersion)
        if q and q.strip():
            term = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    ArticleVersion.change_note.ilike(term),
                    ArticleVersion.title.ilike(term),
                )
            )
        total = query.count()
        rows = (
            query.order_by(ArticleVersion.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        user_ids = {r.changed_by for r in rows if r.changed_by}
        emails: dict[str, str] = {}
        if user_ids:
            for u in self.db.query(User).filter(User.id.in_(user_ids)).all():
                emails[str(u.id)] = u.email or ""
        items: list[dict[str, Any]] = []
        for r in rows:
            cid = str(r.changed_by) if r.changed_by else None
            items.append(
                {
                    "id": r.id,
                    "article_id": r.article_id,
                    "article_title": r.title,
                    "version_number": r.version_number,
                    "change_note": r.change_note,
                    "changed_by": cid,
                    "actor_email": emails.get(cid) if cid else None,
                    "created_at": r.created_at,
                }
            )
        return total, items
    def list_admin_knowledge_gaps(
        self,
        *,
        limit: int = 10,
        offset: int = 0,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Paginated top knowledge gaps (unanswered queries grouped by text)."""
        from sqlalchemy import func as sqlfunc

        base_query = self.db.query(QueryLog.query_text).filter(QueryLog.answered.is_(False))
        total = base_query.distinct().count()

        gap_rows = (
            self.db.query(QueryLog.query_text, sqlfunc.count(QueryLog.id).label("cnt"), sqlfunc.max(QueryLog.created_at).label("last"))
            .filter(QueryLog.answered.is_(False))
            .group_by(QueryLog.query_text)
            .order_by(sqlfunc.count(QueryLog.id).desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        items = [
            {"query": r.query_text, "count": r.cnt, "last_seen": r.last.isoformat() if r.last else None}
            for r in gap_rows
        ]
        return total, items
