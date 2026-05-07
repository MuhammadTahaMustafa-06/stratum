from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.auth.roles import ALL_ROLES, canonicalize_role

_ARTICLE_DOMAINS = frozenset({"general", "application", "banking", "process", "tribal"})


# --- Shared ---

class GenericError(BaseModel):
    detail: str


class SourceMetadata(BaseModel):
    doc_id: str
    page: str
    score: float
    metadata: dict[str, Any] = {}


class MetadataFilters(BaseModel):
    domain: Optional[str] = None
    team: Optional[str] = None
    system: Optional[str] = None
    process: Optional[str] = None


# --- Ask / Search ---

class AskRequest(BaseModel):
    query: Annotated[str, Field(min_length=1, max_length=8000)]
    intent: Annotated[str, Field(min_length=1, max_length=64)] = "general"
    filters: Optional[MetadataFilters] = None
    history: list[dict] = Field(default_factory=list, max_length=50)

    @field_validator("history", mode="before")
    @classmethod
    def ask_history_none_to_empty(cls, v):
        return v if v is not None else []

    @field_validator("intent")
    @classmethod
    def intent_slug(cls, v: str) -> str:
        s = (v or "general").strip().lower()
        if not s:
            return "general"
        return s[:64]


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceMetadata] = []
    confidence: float = 0.0
    intent: str = "general"
    used_fallback: bool = False


class SearchRequest(BaseModel):
    query: Annotated[str, Field(min_length=1, max_length=2000)]
    filters: Optional[MetadataFilters] = None
    top_k: Optional[int] = Field(default=None, ge=1, le=100)
    domain: Optional[Annotated[str, Field(max_length=64)]] = None


class SearchResult(BaseModel):
    id: str
    snippet: str
    score: float
    metadata: dict[str, Any] = {}


class SearchResponse(BaseModel):
    query: str
    count: int
    results: list[SearchResult]


# --- Feedback ---

class FeedbackRequest(BaseModel):
    query: Annotated[str, Field(min_length=1, max_length=8000)]
    answer: Optional[Annotated[str, Field(max_length=50000)]] = None
    rating: int  # 1 = helpful, -1 = not helpful
    comment: Optional[Annotated[str, Field(max_length=4000)]] = None
    sources: list[Annotated[str, Field(max_length=512)]] = Field(default_factory=list, max_length=64)

    @field_validator("sources", mode="before")
    @classmethod
    def sources_none_to_empty(cls, v):
        return v if v is not None else []

    @field_validator("rating")
    @classmethod
    def rating_allowed(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("rating must be 1 (helpful) or -1 (not helpful).")
        return v


class FeedbackResponse(BaseModel):
    status: str
    message: str


# --- Articles ---

class ArticleCreateRequest(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=300)]
    content: Annotated[str, Field(min_length=1, max_length=500_000)]
    summary: Optional[Annotated[str, Field(max_length=2000)]] = None
    domain: str = "general"
    tags: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(default_factory=list, max_length=40)
    team: Optional[Annotated[str, Field(max_length=128)]] = None
    system_name: Optional[Annotated[str, Field(max_length=255)]] = None
    process_type: Optional[Annotated[str, Field(max_length=128)]] = None
    expires_at: Optional[datetime] = None

    @field_validator("tags", mode="before")
    @classmethod
    def tags_none_to_empty(cls, v):
        return v if v is not None else []

    @field_validator("domain")
    @classmethod
    def domain_allowed(cls, v: str) -> str:
        s = (v or "general").strip().lower()
        if s not in _ARTICLE_DOMAINS:
            raise ValueError(f"domain must be one of: {', '.join(sorted(_ARTICLE_DOMAINS))}")
        return s


class ArticleUpdateRequest(BaseModel):
    title: Optional[Annotated[str, Field(min_length=1, max_length=300)]] = None
    content: Optional[Annotated[str, Field(min_length=1, max_length=500_000)]] = None
    summary: Optional[Annotated[str, Field(max_length=2000)]] = None
    domain: Optional[str] = None
    tags: Optional[list[Annotated[str, Field(min_length=1, max_length=64)]]] = Field(default=None, max_length=40)
    team: Optional[Annotated[str, Field(max_length=128)]] = None
    system_name: Optional[Annotated[str, Field(max_length=255)]] = None
    process_type: Optional[Annotated[str, Field(max_length=128)]] = None
    is_pinned: Optional[bool] = None
    expires_at: Optional[datetime] = None

    @field_validator("domain")
    @classmethod
    def domain_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip().lower()
        if s not in _ARTICLE_DOMAINS:
            raise ValueError(f"domain must be one of: {', '.join(sorted(_ARTICLE_DOMAINS))}")
        return s


class ArticleActionRequest(BaseModel):
    comment: Annotated[str, Field(max_length=4000)] = ""


class ArticleResponse(BaseModel):
    id: str
    title: str
    content: str
    summary: Optional[str] = None
    domain: str
    tags: list[str] = []
    status: str
    author_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    team: Optional[str] = None
    system_name: Optional[str] = None
    process_type: Optional[str] = None
    is_pinned: bool = False
    view_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ArticleListResponse(BaseModel):
    """Paginated article list: `total` matches current filters; `items` is this page."""

    total: int
    items: list[ArticleResponse]


# --- Learning Paths ---

class LearningPathItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    article_id: Optional[str] = None
    resource_url: Optional[str] = None
    item_type: str = "article"
    position: int = 0
    is_required: bool = True


class LearningPathCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_role: Optional[str] = None
    target_team: Optional[str] = None
    difficulty: str = "beginner"
    estimated_hours: Optional[float] = None
    is_onboarding: bool = False
    items: Optional[list[LearningPathItemCreate]] = []


class LearningPathItemResponse(BaseModel):
    id: str
    path_id: str
    article_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    resource_url: Optional[str] = None
    item_type: str
    position: int
    is_required: bool
    completed: Optional[bool] = None


class LearningPathResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    target_role: Optional[str] = None
    target_team: Optional[str] = None
    difficulty: str
    estimated_hours: Optional[float] = None
    is_onboarding: bool
    is_published: bool
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    item_count: int = 0
    items: Optional[list[LearningPathItemResponse]] = None
    enrolled: Optional[bool] = None
    progress_pct: Optional[float] = None


class LearningPathListResponse(BaseModel):
    count: int
    items: list[LearningPathResponse]


class ProgressUpdateRequest(BaseModel):
    item_id: str
    completed: bool = True


# --- Experts ---

class ExpertProfileCreate(BaseModel):
    domains: Optional[list[str]] = []
    systems: Optional[list[str]] = []
    skills: Optional[list[str]] = []
    availability: str = "available"
    contact_preference: str = "slack"


class ExpertProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    team: Optional[str] = None
    department: Optional[str] = None
    domains: list[str] = []
    systems: list[str] = []
    skills: list[str] = []
    availability: str
    contact_preference: str
    articles_count: int = 0
    avatar_url: Optional[str] = None
    bio: Optional[str] = None


class ExpertListResponse(BaseModel):
    count: int
    items: list[ExpertProfileResponse]


# --- Admin / Analytics ---

class PdfQualityReport(BaseModel):
    """Upload-time signal for text-RAG suitability (not topical relevance)."""

    tier: Literal["ok", "warn", "fail"]
    page_count: int
    extractable_chars: int
    messages: list[str] = Field(default_factory=list)


class PdfUploadResponse(BaseModel):
    filename: str
    bytes: int
    message: str
    quality: PdfQualityReport | None = None


class RawFileInfo(BaseModel):
    name: str
    size_bytes: int


class KnowledgeReconciliationArticleRef(BaseModel):
    id: str
    title: str
    status: str


class KnowledgeSourceReconciliationRow(BaseModel):
    """One PDF basename (logical source) and how far it has progressed through raw → index → portal."""

    file_name: str
    file_name_key: str
    has_raw: bool
    in_vector_index: bool
    in_ingest_registry: bool
    article_count: int = 0
    articles: list[KnowledgeReconciliationArticleRef] = Field(default_factory=list)
    situation: Literal[
        "in_sync",
        "rag_only",
        "portal_not_indexed",
        "raw_only",
        "orphan_article",
        "portal_indexed_missing_raw",
        "vectors_missing_raw",
        "registry_only",
    ]


class AdminSourcesResponse(BaseModel):
    collection_name: str
    collection_count: int
    processed_files: list[str]
    raw_files: list[RawFileInfo] = []
    reconciliation: list[KnowledgeSourceReconciliationRow] = Field(default_factory=list)


class AdminReindexRequest(BaseModel):
    force: bool = False


class AdminReindexResponse(BaseModel):
    status: str
    message: str


class KnowledgeGap(BaseModel):
    query: str
    count: int
    last_seen: Optional[datetime] = None


class AnalyticsSummaryResponse(BaseModel):
    total_articles: int
    status_breakdown: dict[str, int]
    expiring_soon_count: int
    total_queries: int
    unanswered_queries: int
    helpful_feedback: int
    not_helpful_feedback: int
    top_knowledge_gaps: list[KnowledgeGap] = []
    total_knowledge_gaps: int = 0
    total_learning_paths: int = 0
    total_experts: int = 0


class KnowledgeGapListResponse(BaseModel):
    total: int
    items: list[KnowledgeGap]


class AdminQueryLogItem(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    query_text: str
    query_type: str
    domain_filter: Optional[str] = None
    result_count: int
    answered: bool
    latency_ms: Optional[int] = None
    created_at: datetime


class AdminQueryLogListResponse(BaseModel):
    total: int
    items: list[AdminQueryLogItem]


class AdminAuditEventItem(BaseModel):
    id: str
    article_id: str
    article_title: str
    version_number: int
    change_note: Optional[str] = None
    changed_by: Optional[str] = None
    actor_email: Optional[str] = None
    created_at: datetime


class AdminAuditEventListResponse(BaseModel):
    total: int
    items: list[AdminAuditEventItem]


class AdminFeedbackItem(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    query_text: str
    answer_text: Optional[str] = None
    rating: int
    comment: Optional[str] = None
    sources: list[str] = []
    created_at: datetime


class AdminFeedbackListResponse(BaseModel):
    total: int
    items: list[AdminFeedbackItem]


# --- Bookmarks ---

class BookmarkResponse(BaseModel):
    id: str
    article_id: str
    article_title: Optional[str] = None
    article_domain: Optional[str] = None
    created_at: Optional[datetime] = None


class BookmarkListResponse(BaseModel):
    total: int
    items: list[BookmarkResponse]


class BookmarkCreateRequest(BaseModel):
    article_id: Annotated[str, Field(min_length=1, max_length=36)]


# --- User Management (Admin) ---

class UserCreateRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=256)]
    full_name: Annotated[str, Field(min_length=1, max_length=255)]
    role: str = "employee"
    team: Optional[Annotated[str, Field(max_length=128)]] = None
    department: Optional[Annotated[str, Field(max_length=128)]] = None

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return str(v).lower().strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter.")
        return v

    @field_validator("role")
    @classmethod
    def role_ok(cls, v: str) -> str:
        r = canonicalize_role(v or "employee")
        if r not in ALL_ROLES:
            raise ValueError(f"role must be one of: {', '.join(sorted(ALL_ROLES))}")
        return r


class UserUpdateRequest(BaseModel):
    """Admin-only patch: toggle active state and/or reassign role."""
    is_active: Optional[bool] = None
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def role_ok(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        r = canonicalize_role(v or "employee")
        if r not in ALL_ROLES:
            raise ValueError(f"role must be one of: {', '.join(sorted(ALL_ROLES))}")
        return r


class UserListResponse(BaseModel):
    count: int
    items: list[Any]
