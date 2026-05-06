"""
Security utilities: password hashing, JWT access/refresh/MFA tokens.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

# Short-lived MFA "pending" token duration
_MFA_TOKEN_MINUTES = 5
_REFRESH_TOKEN_DAYS = 30


# ── Passwords ──────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ── JWT helpers ────────────────────────────────────────────────────────────────

def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _decode(token: str, *, typ: str | None = None) -> dict:
    data = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
        leeway=settings.jwt_clock_skew_seconds,
    )
    if typ and data.get("typ") != typ:
        raise jwt.InvalidTokenError(f"Expected token type '{typ}', got '{data.get('typ')}'.")
    return data


# ── Access token (short-lived, sent in Authorization header) ──────────────────

def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "nbf": now,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "typ": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return _encode(payload)


def decode_token(token: str) -> dict:
    return _decode(token, typ="access")


# ── Refresh token (long-lived, stored hashed in DB) ───────────────────────────

def create_refresh_token(subject: str) -> tuple[str, str]:
    """
    Returns (plain_token, hashed_token).
    Store only the hash; return plain to the client.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=_REFRESH_TOKEN_DAYS)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "typ": "refresh",
        "jti": secrets.token_hex(16),
    }
    plain = _encode(payload)
    hashed = _hash_token(plain)
    return plain, hashed


def decode_refresh_token(token: str) -> dict:
    return _decode(token, typ="refresh")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_refresh_token(plain: str, stored_hash: str) -> bool:
    return _hash_token(plain) == stored_hash


# ── MFA "pending" token (very short-lived, proves password was valid) ─────────

def create_mfa_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=_MFA_TOKEN_MINUTES)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "typ": "mfa",
    }
    return _encode(payload)


def decode_mfa_token(token: str) -> dict:
    return _decode(token, typ="mfa")
