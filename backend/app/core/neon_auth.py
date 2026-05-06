"""Verify Neon Auth access JWTs via JWKS (EdDSA / RS256 / ES256)."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import jwt
from jwt import PyJWKClient

from app.core.config import settings

_log = logging.getLogger(__name__)

__all__ = ["decode_neon_access_token", "parse_neon_user_claims"]


def decode_neon_access_token(token: str) -> dict[str, Any]:
    """
    Validate signature and expiry using Neon’s JWKS.

    Neon Console shows **Auth URL** and **JWKS URL**; set ``NEON_AUTH_URL`` to the Auth URL.
    JWKS is always ``{NEON_AUTH_URL}/.well-known/jwks.json``.
    """
    base = (settings.neon_auth_url or "").strip().rstrip("/")
    if not base.startswith("https://"):
        raise ValueError("NEON_AUTH_URL must be the https Auth URL from Neon Console.")

    jwks_url = f"{base}/.well-known/jwks.json"
    try:
        jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
    except Exception as e:
        _log.warning("Neon JWKS %s: %s", jwks_url, e)
        raise ValueError(
            f"Could not load signing keys from {jwks_url}. Check NEON_AUTH_URL matches Console → Auth URL."
        ) from e

    header = jwt.get_unverified_header(token)
    alg = header.get("alg") or "EdDSA"
    if alg not in ("ES256", "RS256", "EdDSA"):
        raise ValueError(f"Unsupported JWT algorithm: {alg}")

    # Neon clocks often disagree with app hosts; signature + ``exp`` are enough for server-side exchange.
    skew_sec = max(300, int(settings.jwt_clock_skew_seconds))
    try:
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            options={
                "verify_aud": False,
                "verify_iat": False,
                "verify_nbf": False,
                "require": ["exp", "sub"],
            },
            leeway=timedelta(seconds=skew_sec),
        )
    except jwt.ExpiredSignatureError as e:
        raise ValueError("Neon session expired. Sign in again.") from e
    except jwt.PyJWTError as e:
        raise ValueError(f"Invalid Neon JWT: {e}") from e


def _extract_email(claims: dict[str, Any]) -> str:
    """OAuth tokens may omit top-level ``email``; check metadata / identities."""
    top = str(claims.get("email") or "").strip().lower()
    if "@" in top:
        return top
    for key in ("user_metadata", "app_metadata"):
        block = claims.get(key)
        if isinstance(block, dict):
            em = str(block.get("email") or "").strip().lower()
            if "@" in em:
                return em
    ident = claims.get("identities")
    if isinstance(ident, list):
        for row in ident:
            if not isinstance(row, dict):
                continue
            idd = row.get("identity_data")
            if isinstance(idd, dict):
                em = str(idd.get("email") or "").strip().lower()
                if "@" in em:
                    return em
    pref = str(claims.get("preferred_username") or "").strip().lower()
    if "@" in pref:
        return pref
    return ""


def parse_neon_user_claims(claims: dict[str, Any]) -> tuple[str, str, str | None, str, str]:
    """
    Return (email, full_name, avatar_url, external_sub, oauth_provider_label).

    ``external_sub`` is Neon Auth user id (JWT ``sub``); stored in ``users.neon_auth_sub``.
    """
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise ValueError("Neon token missing sub.")

    email = _extract_email(claims)
    if not email:
        raise ValueError(
            "Neon token did not include an email address. "
            "Ensure Google OAuth scopes include email profile and Neon Auth maps the account."
        )

    meta = claims.get("user_metadata") or claims.get("app_metadata") or {}
    if isinstance(meta, dict):
        name = str(meta.get("full_name") or meta.get("name") or "").strip()
        avatar = meta.get("picture") or meta.get("avatar_url")
    else:
        name = ""
        avatar = None

    full_name = (
        str(claims.get("name") or "").strip()
        or name
        or email.split("@")[0]
    )
    avatar_url = str(avatar).strip() if avatar else None

    provider = "google"
    amr = claims.get("amr")
    if isinstance(amr, list) and amr:
        provider = str(amr[0]).lower()
    elif isinstance(claims.get("provider"), str):
        provider = claims["provider"].lower()

    return (email, full_name, avatar_url, sub, provider)
