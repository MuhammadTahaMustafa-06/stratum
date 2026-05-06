"""
Main API router — Stratum (restricted feature set).
Endpoints: auth-protected chat/ask/search, article CRUD + lifecycle, bookmarks, admin, analytics.
Learning paths and expert directory are intentionally excluded from this router.
"""
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import (
    require_domain_expert,
    require_knowledge_access,
    require_knowledge_admin,
    require_platform_admin,
    require_portal,
    require_sources_admin,
)
from app.auth import roles as role_defs
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat_schema import ChatRequest, ChatResponse
from app.services.document_quality import assess_pdf_for_rag
from app.schemas.km_schema import (
    AdminReindexRequest,
    AdminReindexResponse,
    AdminSourcesResponse,
    PdfQualityReport,
    PdfUploadResponse,
    RawFileInfo,
    AdminAuditEventListResponse,
    AdminAuditEventItem,
    AdminQueryLogListResponse,
    AdminQueryLogItem,
    AnalyticsSummaryResponse,
    AskRequest,
    AskResponse,
    FeedbackRequest,
    FeedbackResponse,
    MetadataFilters,
    SearchRequest,
    SearchResponse,
    SearchResult,
    SourceMetadata,
    ArticleActionRequest,
    ArticleCreateRequest,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdateRequest,
    BookmarkCreateRequest,
    BookmarkListResponse,
    BookmarkResponse,
    UserCreateRequest,
    UserUpdateRequest,
    UserListResponse,
)
from app.services.content_service import ContentService
from app.services.knowledge_reconciliation import build_knowledge_reconciliation_rows
from app.services.fusion import reciprocal_rank_fusion
from app.services.guardrail_service import GuardrailService
from app.services.llm_service import LLMService
from app.services.monitoring_service import Monitoring
from app.services.rag_providers import get_llm_service, get_reranker_service, get_retrieval_service
from app.services.reranker_service import RerankerService
from app.services.retrieval_service import RetrievalService
from app.core.config import settings
from app.core.security import hash_password

router = APIRouter()


@router.get("/ping")
def ping():
    return {"status": "ok", "service": "stratum-api"}


# ── Dependency factories (heavy RAG models: see app.services.rag_providers) ─

def get_guardrail_service() -> GuardrailService:
    return GuardrailService()

def get_content_service(db: Session = Depends(get_db)) -> ContentService:
    return ContentService(db)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _active_filters(filters: Dict) -> Dict[str, str]:
    return {k: v for k, v in filters.items() if v}

def _filters_for_user(req_filters, user: User) -> Dict[str, str]:
    canonical_role = role_defs.canonicalize_role(user.role)
    data = req_filters.model_dump() if isinstance(req_filters, MetadataFilters) else (req_filters if isinstance(req_filters, dict) else {})
    active = _active_filters(data)
    if settings.enforce_metadata_team_scope and user.team:
        if canonical_role in (role_defs.EMPLOYEE, role_defs.DOMAIN_EXPERT):
            active.setdefault("team", user.team)
    return active


def _resolve_raw_ingest_pdf(basename: str) -> Path:
    """
    Resolve ``basename`` (filename only, e.g. Policy.pdf) under ``settings.data_dir`` (default data/raw).
    Prevents path traversal. Caller should verify ``.is_file()`` before streaming.
    """
    name = (basename or "").strip()
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    safe = Path(name).name
    raw_dir = Path(settings.data_dir)
    if not raw_dir.is_absolute():
        raw_dir = Path(__file__).resolve().parents[2] / raw_dir
    raw_base = raw_dir.resolve()
    candidate = (raw_dir / safe).resolve()
    if not str(candidate).startswith(str(raw_base)):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    return candidate


# ── RAG core ──────────────────────────────────────────────────────────────────

def _run_rag_pipeline(
    query: str,
    user: User,
    intent: str,
    filters: Dict[str, str],
    history: Optional[list] = None,
    domain: Optional[str] = None,
    retriever: RetrievalService = None,
    reranker: RerankerService = None,
    llm: LLMService = None,
    guardrails: GuardrailService = None,
    content: Optional[ContentService] = None,
) -> AskResponse:
    langfuse = Monitoring.get_langfuse()
    t_start = time.monotonic()

    with langfuse.start_as_current_observation(as_type="span", name="stratum-rag-query",
                                               input={"query": query, "intent": intent}):
        if not guardrails.validate_input(query):
            raise HTTPException(status_code=400, detail="Query blocked by security guardrails.")

        vector_results = retriever.search_vector(query, metadata_filters=filters)
        bm25_results = retriever.search_bm25(query, metadata_filters=filters)
        hybrid_results = reciprocal_rank_fusion(vector_results, bm25_results)
        top_chunks = reranker.score_and_rank(query, hybrid_results)

        if not top_chunks:
            answer = guardrails.low_confidence_fallback(query)
            if content:
                content.log_query(user.id, query, intent, 0, False, domain,
                                  int((time.monotonic() - t_start) * 1000))
            return AskResponse(answer=answer, sources=[], confidence=0.0, intent=intent, used_fallback=True)

        avg_score = sum(c.get("reranker_score", 0.0) for c in top_chunks) / len(top_chunks)
        valid, safe_eval = guardrails.validate_output(answer="", avg_reranker_score=avg_score,
                                                      threshold=settings.reranker_threshold)
        if not valid:
            if content:
                content.log_query(user.id, query, intent, 0, False, domain,
                                  int((time.monotonic() - t_start) * 1000))
            return AskResponse(answer=safe_eval, sources=[], confidence=0.0, intent=intent, used_fallback=True)

        raw_answer = llm.generate_answer(query, top_chunks, history=history or [], domain=domain)
        valid, final_answer = guardrails.validate_output(answer=raw_answer, avg_reranker_score=avg_score)
        confidence = guardrails.calculate_confidence(top_chunks)
        used_fallback = confidence < settings.low_confidence_threshold
        if used_fallback:
            final_answer = guardrails.low_confidence_fallback(query)

        sources = [
            SourceMetadata(
                doc_id=str(c.get("metadata", {}).get("doc_id", c["id"])),
                page=str(c.get("metadata", {}).get("page_number_range", "—")),
                score=float(c.get("reranker_score", 0.0)),
                metadata=c.get("metadata", {}),
            )
            for c in top_chunks
        ]

        latency = int((time.monotonic() - t_start) * 1000)
        if content:
            content.log_query(user.id, query, intent, len(top_chunks), not used_fallback, domain, latency,
                              [s.doc_id for s in sources[:3]])

        return AskResponse(answer=final_answer, sources=sources, confidence=confidence,
                           intent=intent, used_fallback=used_fallback)


# ── Chat / Ask / Search ───────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
def handle_chat(
    req: ChatRequest,
    current_user: User = Depends(require_knowledge_access),
    retriever: RetrievalService = Depends(get_retrieval_service),
    reranker: RerankerService = Depends(get_reranker_service),
    llm: LLMService = Depends(get_llm_service),
    guardrails: GuardrailService = Depends(get_guardrail_service),
    content: ContentService = Depends(get_content_service),
):
    filters = _filters_for_user(MetadataFilters(domain=req.domain), current_user)
    resp = _run_rag_pipeline(
        query=req.query, user=current_user, intent="chat", filters=filters,
        history=[m.model_dump() for m in (req.history or [])], domain=req.domain,
        retriever=retriever, reranker=reranker, llm=llm, guardrails=guardrails, content=content,
    )
    return ChatResponse(answer=resp.answer, sources=resp.sources, confidence=resp.confidence,
                        used_fallback=resp.used_fallback)


@router.post("/ask", response_model=AskResponse)
def ask_knowledge(
    req: AskRequest,
    current_user: User = Depends(require_knowledge_access),
    retriever: RetrievalService = Depends(get_retrieval_service),
    reranker: RerankerService = Depends(get_reranker_service),
    llm: LLMService = Depends(get_llm_service),
    guardrails: GuardrailService = Depends(get_guardrail_service),
    content: ContentService = Depends(get_content_service),
):
    filters = _filters_for_user(req.filters or MetadataFilters(), current_user)
    return _run_rag_pipeline(
        query=req.query, user=current_user, intent=req.intent, filters=filters,
        history=req.history or [], domain=(req.filters.domain if req.filters else None),
        retriever=retriever, reranker=reranker, llm=llm, guardrails=guardrails, content=content,
    )


@router.post("/search", response_model=SearchResponse)
def search_knowledge(
    req: SearchRequest,
    current_user: User = Depends(require_knowledge_access),
    retriever: RetrievalService = Depends(get_retrieval_service),
):
    filters = _filters_for_user(req.filters or MetadataFilters(domain=req.domain), current_user)
    vector_results = retriever.search_vector(req.query, metadata_filters=filters)
    bm25_results = retriever.search_bm25(req.query, metadata_filters=filters)
    fused = reciprocal_rank_fusion(vector_results, bm25_results)[: req.top_k or settings.search_default_top_k]
    results = []
    for item in fused:
        # Safely extract score: reranker > bm25/vector > 0.0
        # Prevents float(None) TypeError if distance/score key exists but is None
        val = item.get("reranker_score")
        if val is None:
            val = item.get("score")
        if val is None:
            val = item.get("distance")
        if val is None:
            val = 0.0
        results.append(
            SearchResult(
                id=str(item["id"]),
                snippet=item.get("text", "")[:300],
                score=float(val),
                metadata=item.get("metadata", {}),
            )
        )
    return SearchResponse(query=req.query, count=len(results), results=results)


# ── Feedback ──────────────────────────────────────────────────────────────────

@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(
    req: FeedbackRequest,
    current_user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    content.save_feedback(
        user_id=current_user.id,
        query_text=req.query,
        answer_text=req.answer,
        rating=req.rating,
        comment=req.comment,
        sources=req.sources,
    )
    return FeedbackResponse(status="ok", message="Feedback recorded.")


# ── Bookmarks ─────────────────────────────────────────────────────────────────

@router.get("/bookmarks", response_model=BookmarkListResponse)
def list_bookmarks(
    current_user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    rows = content.list_bookmarks(str(current_user.id))
    items = [BookmarkResponse.model_validate(r) for r in rows]
    return BookmarkListResponse(total=len(items), items=items)


@router.post("/bookmarks", response_model=BookmarkResponse)
def create_bookmark(
    req: BookmarkCreateRequest,
    current_user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    if content.get_article_status(req.article_id) is None:
        raise HTTPException(status_code=404, detail="Article not found.")
    row = content.add_bookmark(str(current_user.id), req.article_id)
    return BookmarkResponse.model_validate(row)


@router.delete("/bookmarks/{article_id}", status_code=204)
def delete_bookmark(
    article_id: str,
    current_user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    if not content.remove_bookmark(str(current_user.id), article_id):
        raise HTTPException(status_code=404, detail="Bookmark not found.")
    return Response(status_code=204)


# ── Articles ──────────────────────────────────────────────────────────────────

@router.get("/articles", response_model=ArticleListResponse)
def list_articles(
    q: Optional[str] = None,
    domain: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    _user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    total = content.count_articles(q=q, domain=domain, status=status)
    rows = content.list_articles(q=q, domain=domain, status=status, limit=limit, offset=offset)
    items = [ArticleResponse.model_validate(r) for r in rows]
    return ArticleListResponse(total=total, items=items)


@router.get("/articles/{article_id}", response_model=ArticleResponse)
def get_article(
    article_id: str,
    _user: User = Depends(require_knowledge_access),
    content: ContentService = Depends(get_content_service),
):
    item = content.get_article(article_id)
    if not item:
        raise HTTPException(status_code=404, detail="Article not found.")
    return item


@router.get("/articles/{article_id}/pdf")
def article_linked_pdf(
    article_id: str,
    _user: User = Depends(require_knowledge_access),
    db: Session = Depends(get_db),
):
    """
    Stream a PDF from the raw ingest directory when the article's `system_name`
    is set to that filename (e.g. `CardPolicy.pdf`). Prevents path traversal.
    """
    from app.models.article import Article

    a = db.get(Article, article_id)
    if not a:
        raise HTTPException(status_code=404, detail="Article not found.")
    name = (a.system_name or "").strip()
    if not name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=404,
            detail="No linked PDF — set the article's system field to the raw PDF filename (e.g. Policy.pdf).",
        )
    candidate = _resolve_raw_ingest_pdf(Path(name).name)
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Linked PDF is not in the ingest folder yet.")
    return FileResponse(candidate, media_type="application/pdf", filename=candidate.name)


@router.get("/knowledge/raw-pdf")
def serve_raw_knowledge_pdf(
    file: str = Query(..., min_length=1, max_length=512, description="PDF filename under data/raw"),
    _user: User = Depends(require_knowledge_access),
):
    """Stream a PDF from the raw ingest folder by filename (same library RAG chunks use)."""
    candidate = _resolve_raw_ingest_pdf(file)
    if not candidate.is_file():
        raise HTTPException(
            status_code=404,
            detail="PDF not found in the knowledge ingest folder.",
        )
    return FileResponse(candidate, media_type="application/pdf", filename=candidate.name)


@router.post("/articles", response_model=ArticleResponse)
def create_article(
    req: ArticleCreateRequest,
    user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    return content.create_article(req.model_dump(), user.id)


@router.put("/articles/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: str,
    req: ArticleUpdateRequest,
    user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    updated = content.update_article(article_id, req.model_dump(exclude_unset=True), user.id)
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found.")
    return updated


@router.delete("/articles/{article_id}", status_code=204)
def delete_article(
    article_id: str,
    _user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    if not content.delete_article(article_id):
        raise HTTPException(status_code=404, detail="Article not found.")
    return Response(status_code=204)


@router.post("/articles/{article_id}/submit-review", response_model=ArticleResponse)
def submit_review(
    article_id: str,
    req: ArticleActionRequest,
    user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    updated = content.transition_status(article_id, "in_review", user.id, req.comment or "")
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found.")
    return updated


@router.post("/articles/{article_id}/approve", response_model=ArticleResponse)
def approve_article(
    article_id: str,
    req: ArticleActionRequest,
    user: User = Depends(require_domain_expert),
    content: ContentService = Depends(get_content_service),
):
    updated = content.transition_status(article_id, "published", user.id, req.comment or "")
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found.")
    return updated


@router.post("/articles/{article_id}/archive", response_model=ArticleResponse)
def archive_article(
    article_id: str,
    req: ArticleActionRequest,
    user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    updated = content.transition_status(article_id, "archived", user.id, req.comment or "")
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found.")
    return updated


@router.post("/articles/{article_id}/unarchive", response_model=ArticleResponse)
def unarchive_article(
    article_id: str,
    req: ArticleActionRequest,
    user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    """Restore an archived article to published (same visibility as before archive)."""
    st = content.get_article_status(article_id)
    if st is None:
        raise HTTPException(status_code=404, detail="Article not found.")
    if st != "archived":
        raise HTTPException(status_code=400, detail="Only archived articles can be unarchived.")
    updated = content.transition_status(article_id, "published", user.id, req.comment or "")
    if not updated:
        raise HTTPException(status_code=404, detail="Article not found.")
    return updated


# ── Admin ─────────────────────────────────────────────────────────────────────

def _safe_pdf_filename(original: str) -> str:
    name = Path(original).name
    if not name.lower().endswith(".pdf"):
        return ""
    stem = name[:-4]
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("._") or "document"
    return f"{stem[:100]}.pdf"


def _unique_pdf_path(directory: Path, filename: str) -> Path:
    candidate = directory / filename
    if not candidate.exists():
        return candidate
    stem, suf = Path(filename).stem, Path(filename).suffix
    for i in range(1, 500):
        alt = directory / f"{stem}_{i}{suf}"
        if not alt.exists():
            return alt
    return directory / f"{stem}_{uuid.uuid4().hex[:10]}{suf}"


@router.post("/admin/upload-pdf", response_model=PdfUploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_sources_admin),
):
    """Accept a PDF into the raw ingest directory (Knowledge / System Admin)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    safe = _safe_pdf_filename(file.filename)
    if not safe:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    max_bytes = max(settings.max_request_size_mb, 1) * 1024 * 1024
    raw_dir = Path(settings.data_dir)
    if not raw_dir.is_absolute():
        raw_dir = Path(__file__).resolve().parents[2] / raw_dir
    raw_dir.mkdir(parents=True, exist_ok=True)
    dest = _unique_pdf_path(raw_dir, safe)
    total = 0
    seen_pdf_header = False
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                if not seen_pdf_header:
                    seen_pdf_header = True
                    if not chunk.startswith(b"%PDF-"):
                        dest.unlink(missing_ok=True)
                        raise HTTPException(status_code=400, detail="File does not look like a valid PDF.")
                total += len(chunk)
                if total > max_bytes:
                    try:
                        dest.unlink(missing_ok=True)
                    except OSError:
                        pass
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum size of {settings.max_request_size_mb} MB.",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="Failed to save file.") from exc
    finally:
        await file.close()

    if total == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty file.")

    q = assess_pdf_for_rag(dest)
    quality = PdfQualityReport(
        tier=q.tier,
        page_count=q.page_count,
        extractable_chars=q.extractable_chars,
        messages=q.messages,
    )
    return PdfUploadResponse(
        filename=dest.name,
        bytes=total,
        message="Saved to raw ingest folder. Run the ingestion pipeline or Admin reindex to update search.",
        quality=quality,
    )


@router.get("/admin/sources", response_model=AdminSourcesResponse)
def list_sources(
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_sources_admin),
    db: Session = Depends(get_db),
    retriever: RetrievalService = Depends(get_retrieval_service),
):
    backend_root = Path(__file__).resolve().parents[2]
    processed_dir = Path(settings.processed_dir)
    raw_dir = Path(settings.data_dir)
    if not processed_dir.is_absolute():
        processed_dir = backend_root / processed_dir
    if not raw_dir.is_absolute():
        raw_dir = backend_root / raw_dir
    files = sorted(p.name for p in processed_dir.glob("*.json")) if processed_dir.exists() else []
    raw_files: list[RawFileInfo] = []
    if raw_dir.exists():
        for p in raw_dir.glob("*.pdf"):
            try:
                raw_files.append(RawFileInfo(name=p.name, size_bytes=p.stat().st_size))
            except OSError:
                pass
    count = retriever.chroma_document_count()
    reconciliation = build_knowledge_reconciliation_rows(db, retriever, raw_dir, processed_dir)
    return AdminSourcesResponse(
        collection_name=settings.chroma_collection,
        collection_count=count,
        processed_files=files,
        raw_files=raw_files,
        reconciliation=reconciliation,
    )

@router.delete("/admin/sources/raw/{filename}")
def delete_raw_source(
    filename: str,
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_sources_admin),
):
    raw_dir = Path(settings.data_dir)
    if not raw_dir.is_absolute():
        raw_dir = Path(__file__).resolve().parents[2] / raw_dir
    target = raw_dir / filename
    # Security: prevent path traversal
    if target.parent != raw_dir or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        target.unlink()
    except OSError:
        raise HTTPException(status_code=500, detail="Failed to delete file")

    return {"status": "ok", "message": "File deleted"}

@router.post("/admin/reindex", response_model=AdminReindexResponse)
def trigger_reindex(
    req: AdminReindexRequest,
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_platform_admin),
    retriever: RetrievalService = Depends(get_retrieval_service),
):
    if not settings.enable_admin_reindex:
        raise HTTPException(status_code=403, detail="Admin reindex is disabled.")
    backend_root = Path(__file__).resolve().parents[2]
    subprocess.Popen([sys.executable, "-m", "ingestion.main"], cwd=str(backend_root))
    try:
        retriever.rebuild_whoosh_index()
    except Exception:
        pass
    return AdminReindexResponse(status="started",
                                message="Forced reindex started." if req.force else "Reindex started.")


@router.get("/admin/users", response_model=UserListResponse)
def list_users(
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    from app.models.user import User as UserModel
    users = db.query(UserModel).order_by(UserModel.created_at.desc()).all()
    items = [
        {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role,
         "team": u.team, "department": u.department, "is_active": u.is_active,
         "created_at": u.created_at.isoformat() if u.created_at else None}
        for u in users
    ]
    return UserListResponse(count=len(items), items=items)


@router.post("/admin/users")
def create_user(
    req: UserCreateRequest,
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    _admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    from app.models.user import User as UserModel
    if db.query(UserModel).filter(UserModel.email == req.email.lower()).first():
        raise HTTPException(status_code=409, detail="User already exists.")
    user = UserModel(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name.strip(),
        role=req.role,
        team=req.team,
        department=req.department,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role, "status": "created"}


@router.patch("/admin/users/{user_id}")
def update_user(
    user_id: str,
    req: UserUpdateRequest,
    current_admin: User = Depends(require_platform_admin),
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    db: Session = Depends(get_db),
):
    """Toggle is_active or change role for any user. System admins only."""
    from app.models.user import User as UserModel
    target = db.get(UserModel, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Admins cannot modify their own account here.")
    if req.is_active is not None:
        target.is_active = req.is_active
    if req.role is not None:
        target.role = req.role
    db.commit()
    db.refresh(target)
    return {
        "id": target.id,
        "email": target.email,
        "full_name": target.full_name,
        "role": target.role,
        "is_active": target.is_active,
        "status": "updated",
    }


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
def analytics_summary(
    _user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    return content.analytics_summary()


@router.get("/admin/query-logs", response_model=AdminQueryLogListResponse)
def admin_query_logs(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    answered: Optional[bool] = None,
    query_type: Optional[str] = Query(None, max_length=32),
    q: Optional[str] = Query(None, max_length=500),
    _user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    total, rows = content.list_admin_query_logs(
        limit=limit,
        offset=offset,
        answered=answered,
        query_type=query_type,
        q=q,
    )
    items = [AdminQueryLogItem.model_validate(r) for r in rows]
    return AdminQueryLogListResponse(total=total, items=items)


@router.get("/admin/audit-events", response_model=AdminAuditEventListResponse)
def admin_audit_events(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, max_length=500),
    _user: User = Depends(require_knowledge_admin),
    content: ContentService = Depends(get_content_service),
):
    total, rows = content.list_admin_audit_events(limit=limit, offset=offset, q=q)
    items = [AdminAuditEventItem.model_validate(r) for r in rows]
    return AdminAuditEventListResponse(total=total, items=items)


@router.delete("/admin/users/{user_id}")
def delete_user(
    user_id: str,
    current_admin: User = Depends(require_platform_admin),
    _portal: User = Depends(require_portal(role_defs.PORTAL_ADMIN)),
    db: Session = Depends(get_db),
):
    """Permanently delete a user. System admins only. Cannot delete self."""
    from app.models.user import User as UserModel
    target = db.get(UserModel, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Safety check: You cannot delete your own account from here.")
    db.delete(target)
    db.commit()
    return {"status": "ok", "message": f"User {target.email} deleted successfully."}
