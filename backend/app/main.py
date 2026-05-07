"""
FastAPI Server — Stratum API.
Production-hardened: rate limiting, security headers, RBAC, MFA.
[CI-TRIGGER]: Forcing full pipeline validation.
"""
# ruff: noqa: E402
import os

# Before transitive imports (numpy/pandas stack): avoid NumExpr startup chatter and Windows reload quirks.
os.environ.setdefault("NUMEXPR_MAX_THREADS", "8")
if os.name == "nt":
    # Uvicorn --reload delivers Ctrl+C to the worker; Intel Fortran/MKL can emit forrtl error (200) otherwise.
    os.environ.setdefault("FOR_DISABLE_CONSOLE_CTRL_HANDLER", "1")

import logging
import threading
from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path
from typing import Any, cast

logging.getLogger("numexpr.utils").setLevel(logging.WARNING)

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.api.auth_routes import router as auth_router
from app.api.routes import router as api_router
from app.core.config import settings
from app.db.base import Base
from app.db.connect import startup_connection_error_message
from app.db.schema_migrations import run_light_migrations
from app.db.session import engine
from app.services.rag_providers import warmup_rag_services

_log = logging.getLogger(__name__)


def _cors_origins() -> list[str]:
    return [o.strip() for o in settings.cors_origins.split(",") if o.strip()]


def _allowed_hosts() -> list[str]:
    """Hosts for TrustedHostMiddleware. Always include loopback so Docker/K8s health checks work."""
    hosts = [h.strip() for h in settings.allowed_hosts.split(",") if h.strip()]
    base = hosts if hosts else ["localhost", "127.0.0.1"]
    for loopback in ("127.0.0.1", "localhost"):
        if loopback not in base:
            base.append(loopback)
    return base


def _max_request_bytes() -> int:
    return max(settings.max_request_size_mb, 1) * 1024 * 1024


def _validate_auth_settings() -> None:
    env = settings.environment.lower()
    is_prod = env == "production"
    if is_prod:
        if not (settings.database_url or "").strip():
            raise RuntimeError("DATABASE_URL is required when ENVIRONMENT=production.")
        if settings.expose_api_docs:
            raise RuntimeError("EXPOSE_API_DOCS must be false in production.")
        if settings.rate_limit_storage_url.strip().lower() == "memory://":
            raise RuntimeError("RATE_LIMIT_STORAGE_URL must use Redis in production.")
    if not settings.strict_auth_checks:
        return
    if len(settings.jwt_secret_key) < 32:
        raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters in strict mode.")
    if is_prod and settings.jwt_secret_key.startswith("change-me"):
        raise RuntimeError("JWT_SECRET_KEY default value is not allowed in production.")
    if settings.max_request_size_mb < 1:
        raise RuntimeError("MAX_REQUEST_SIZE_MB must be at least 1.")


def _error_payload(code: str, message: str, hint: str | None = None) -> dict:
    payload = {"error": {"code": code, "message": message}}
    if hint:
        payload["error"]["hint"] = hint
    return payload


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_auth_settings()
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/uploads").mkdir(parents=True, exist_ok=True)
    # Side-effect import so every SQLAlchemy model is registered on Base.metadata before create_all.
    import_module("app.models")

    try:
        Base.metadata.create_all(bind=engine)
        run_light_migrations(engine)
        if settings.rag_warmup_on_startup:

            def _warm_rag_background() -> None:
                try:
                    warmup_rag_services()
                    _log.info("RAG warmup finished.")
                except Exception:
                    _log.exception("RAG warmup failed (non-fatal).")

            threading.Thread(target=_warm_rag_background, name="rag-warmup", daemon=True).start()
            _log.info("RAG warmup started in background; API is accepting requests.")
        else:
            _log.info("Skipping RAG warmup on startup (RAG_WARMUP_ON_STARTUP=false).")
    except OperationalError as e:
        _log.error("Database bootstrap failed.", exc_info=True)
        raise RuntimeError(startup_connection_error_message(e)) from e
    yield
    try:
        from langfuse import get_client
        get_client().flush()
    except Exception:
        pass


def create_app() -> FastAPI:
    is_prod = settings.environment.lower() == "production"
    uploads_dir = Path("data/uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    # Local/staging: always expose Swagger + OpenAPI. Production: only if EXPOSE_API_DOCS=true.
    docs_enabled = (not is_prod) or settings.expose_api_docs

    app = FastAPI(
        title="Stratum API",
        description="Internal Knowledge Management Platform for Banking Software Teams",
        version="2.0.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # ── SlowAPI rate limiting ──────────────────────────────────────────────────
    if settings.rate_limit_enabled:
        try:
            from slowapi import Limiter, _rate_limit_exceeded_handler
            from slowapi.errors import RateLimitExceeded
            from slowapi.util import get_remote_address

            limiter = Limiter(
                key_func=get_remote_address,
                default_limits=["200/minute"],
                storage_uri=settings.rate_limit_storage_url,
            )
            app.state.limiter = limiter
            app.add_exception_handler(
                RateLimitExceeded,
                cast("Any", _rate_limit_exceeded_handler),
            )
        except ImportError:
            _log.warning("slowapi is not installed; rate limiting is disabled.")

    # ── Trusted host ──────────────────────────────────────────────────────────
    if is_prod:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts())

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins() or ["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Cookie"],
        expose_headers=["X-Request-ID"],
    )

    # ── Routes ────────────────────────────────────────────────────────────────
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(api_router, prefix="/api/v1")
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    # ── Prometheus metrics (enable in K8s / Docker observability stack) ────────
    if settings.metrics_enabled:
        try:
            from prometheus_fastapi_instrumentator import Instrumentator

            Instrumentator(should_group_status_codes=True, excluded_handlers=["/metrics"]).instrument(
                app
            ).expose(app, endpoint="/metrics", include_in_schema=False)
        except ImportError:
            pass

    # ── Security headers + request-size middleware ─────────────────────────────
    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        # Enforce max request size
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > _max_request_bytes():
                    return JSONResponse(
                        status_code=413,
                        content=_error_payload(
                            "PAYLOAD_TOO_LARGE",
                            "Request payload exceeds the allowed limit.",
                            f"Keep payloads below {settings.max_request_size_mb} MB.",
                        ),
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content=_error_payload("INVALID_CONTENT_LENGTH", "Invalid Content-Length header."),
                )

        response = await call_next(request)

        # OWASP A05 — Security Misconfiguration: mandatory security headers
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["X-XSS-Protection"] = "1; mode=block"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        # Omit COOP/COEP/CORP on JSON APIs — require-corp breaks many clients, embeds, and tooling.
        h["Cache-Control"] = "no-store, no-cache, must-revalidate"
        h["Pragma"] = "no-cache"

        # HSTS only in production (requires HTTPS)
        if is_prod:
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Content-Security-Policy:
        # Keep API restrictive while allowing Swagger/ReDoc external assets.
        h["Content-Security-Policy"] = (
            "default-src 'none'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "connect-src 'self' https://cdn.jsdelivr.net; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'none'"
        )

        return response

    # ── Exception handlers (no stack traces in responses) ─────────────────────
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError):
        fields = []
        for err in exc.errors():
            loc = err.get("loc") or ()
            field = ".".join(str(x) for x in loc if x != "body")
            fields.append({"field": field or "body", "message": err.get("msg", "Invalid value.")})
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "fields": fields,
                }
            },
        )

    @app.exception_handler(ResponseValidationError)
    async def response_validation_handler(_: Request, exc: ResponseValidationError):
        """FastAPI response_model validation failed (often union/discriminated response shapes)."""
        _log.exception("Response validation failed")
        fields = []
        for err in exc.errors():
            loc = err.get("loc") or ()
            field = ".".join(str(x) for x in loc)
            fields.append({"field": field or "response", "message": err.get("msg", "Invalid value.")})
        payload = {
            "error": {
                "code": "RESPONSE_VALIDATION_ERROR",
                "message": "Server response shape mismatch.",
                "fields": fields,
            }
        }
        if settings.environment.lower() != "production":
            payload["error"]["detail"] = str(exc)
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=payload)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "message" in detail:
            return JSONResponse(status_code=exc.status_code, content={"error": detail})
        if isinstance(detail, dict) and "error" in detail:
            return JSONResponse(status_code=exc.status_code, content=detail)
        if isinstance(detail, str):
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                payload = _error_payload("AUTH_REQUIRED", detail, "Sign in and retry.")
            elif exc.status_code == status.HTTP_403_FORBIDDEN:
                payload = _error_payload("RBAC_FORBIDDEN", detail, "Contact an administrator.")
            elif exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                payload = _error_payload("RATE_LIMITED", detail, "Slow down and retry.")
            else:
                payload = _error_payload("REQUEST_FAILED", detail)
            return JSONResponse(status_code=exc.status_code, content=payload)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload("REQUEST_FAILED", "Request could not be processed."),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        _log.exception("Unhandled error %s %s", request.method, request.url.path)
        payload = _error_payload(
            "INTERNAL_ERROR",
            "An unexpected error occurred.",
            "Please try again. If it persists, contact IT support.",
        )
        # Help local debugging (never expose raw exceptions in production).
        if settings.environment.lower() != "production":
            payload["error"]["detail"] = f"{type(exc).__name__}: {exc}"
        return JSONResponse(status_code=500, content=payload)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
