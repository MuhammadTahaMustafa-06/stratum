"""
HttpOnly refresh cookie helpers — sessions without exposing refresh tokens to JS.

Default on (see Settings.auth_refresh_httponly_cookie). Over HTTP dev the cookie is not Secure;
over HTTPS, Secure is set in production unless AUTH_COOKIE_SECURE overrides.

Pair with frontend authConfig (axios withCredentials). Cookie path is /api/v1/auth.
"""
from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app.core.config import settings
from app.schemas.auth_schema import TokenResponse

AUTH_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _cookie_common() -> dict[str, Any]:
    is_prod = settings.environment.lower() == "production"
    if settings.auth_cookie_secure is not None:
        secure = bool(settings.auth_cookie_secure)
    else:
        secure = is_prod
    samesite = (settings.auth_cookie_samesite or "lax").lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    out: dict[str, Any] = {
        "max_age": settings.jwt_refresh_days * 86400,
        "httponly": True,
        "secure": secure,
        "samesite": samesite,
        "path": AUTH_REFRESH_COOKIE_PATH,
    }
    domain = (settings.auth_cookie_domain or "").strip()
    if domain:
        out["domain"] = domain
    return out


def attach_refresh_cookie(response: Response, plain_refresh: str) -> None:
    if not settings.auth_refresh_httponly_cookie or not plain_refresh:
        return
    kwargs = _cookie_common()
    response.set_cookie(settings.auth_refresh_cookie_name, plain_refresh, **kwargs)


def clear_refresh_cookie(response: Response) -> None:
    if not settings.auth_refresh_httponly_cookie:
        return
    kwargs = _cookie_common()
    domain = kwargs.pop("domain", None)
    response.delete_cookie(
        settings.auth_refresh_cookie_name,
        path=AUTH_REFRESH_COOKIE_PATH,
        domain=domain,
        secure=kwargs.get("secure", False),
        httponly=True,
        samesite=kwargs.get("samesite", "lax"),
    )


def token_json_response(token: TokenResponse) -> JSONResponse:
    """JSON token payload; refresh may be HttpOnly-only (null in body)."""
    payload = jsonable_encoder(token)
    if settings.auth_refresh_httponly_cookie and token.refresh_token:
        plain = token.refresh_token
        payload["refresh_token"] = None
        resp = JSONResponse(content=payload)
        attach_refresh_cookie(resp, plain)
        return resp
    return JSONResponse(content=payload)
