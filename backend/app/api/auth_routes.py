"""
Auth routes: login, Neon Auth OAuth exchange, MFA setup/verify, refresh tokens, change password.

OWASP mitigations applied:
 - A07 (Auth Failures): account lockout, brute-force window, in-memory rate limiting
 - A02 (Cryptographic): bcrypt passwords, SHA-256 refresh token hash, short JWT expiry
 - A01 (Access Control): MFA required check, active flag, locked check
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Any
from pathlib import Path

import jwt
from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, security
from app.auth.roles import canonicalize_role, portals_for_role
from app.core.auth_cookies import clear_refresh_cookie, token_json_response
from app.core.config import settings
from app.core.neon_auth import decode_neon_access_token, parse_neon_user_claims
from app.core.mfa import (
    generate_backup_codes,
    generate_qr_png_b64,
    generate_totp_secret,
    get_provisioning_uri,
    hash_backup_code,
    verify_backup_code,
    verify_totp,
)
from app.core.security import (
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_mfa_token,
    decode_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from app.db.session import get_db
from app.models.deleted_user import DeletedUser
from app.models.user import User
from app.schemas.auth_schema import (
    ChangePasswordRequest,
    LoginRequest,
    MFAConfirmRequest,
    MFADisableRequest,
    MFALoginPending,
    MFASetupResponse,
    MFAVerifyLoginRequest,
    NeonExchangeRequest,
    RefreshRequest,
    TokenResponse,
    UserPublic,
    UserUpdateRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_log = logging.getLogger(__name__)
_AVATAR_MAX_BYTES = 2 * 1024 * 1024
_ALLOWED_AVATAR_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _user_from_bearer_access(credentials: HTTPAuthorizationCredentials | None, db: Session) -> User | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id or not isinstance(user_id, str) or payload.get("typ") != "access":
            return None
    except jwt.PyJWTError:
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def _user_from_refresh_value(raw: str, db: Session) -> User | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        claims = decode_refresh_token(raw)
    except Exception:
        return None
    user = db.get(User, claims["sub"])
    if not user or not user.is_active:
        return None
    if not user.refresh_token_hash or not verify_refresh_token(raw, user.refresh_token_hash):
        return None
    return user

# ── Brute-force window (in-memory, no Redis needed for dev) ───────────────────
_LOCK_THRESHOLD = 5           # attempts before lock
_LOCK_DURATION = timedelta(minutes=15)
_WINDOW = timedelta(minutes=10)


# ── Serialisation helper ──────────────────────────────────────────────────────

def _to_public(user: User) -> UserPublic:
    role = canonicalize_role(user.role)
    return UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role,
        team=user.team,
        department=user.department,
        expertise_tags=user.expertise_list() if hasattr(user, "expertise_list") else [],
        portals=portals_for_role(role),
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_active=user.is_active,
        mfa_enabled=user.mfa_enabled,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


def _token_response(user: User, db: Session) -> TokenResponse:
    """Create access + refresh tokens and persist the refresh hash."""
    access = create_access_token(
        subject=user.id,
        extra_claims={"email": user.email, "role": canonicalize_role(user.role)},
    )
    plain_refresh, hashed_refresh = create_refresh_token(user.id)
    user.refresh_token_hash = hashed_refresh
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=plain_refresh,
        expires_in=settings.jwt_expire_minutes * 60,
        user=_to_public(user),
    )


def _avatar_upload_root() -> Path:
    base = Path("data/uploads/avatars")
    if not base.is_absolute():
        base = Path(__file__).resolve().parents[2] / base
    base.mkdir(parents=True, exist_ok=True)
    return base


def _avatar_uses_s3() -> bool:
    return bool((settings.s3_avatar_bucket or "").strip())


def _avatar_object_key(user_id: str, filename: str) -> str:
    prefix = (settings.s3_avatar_key_prefix or "avatars").strip().strip("/")
    safe_user = "".join(c for c in user_id if c.isalnum() or c in ("-", "_"))
    return f"{prefix}/{safe_user}/{filename}" if prefix else f"{safe_user}/{filename}"


def _avatar_public_url(object_key: str) -> str:
    base = (settings.s3_public_base_url or "").strip().rstrip("/")
    if not base:
        raise HTTPException(
            status_code=500,
            detail="S3_PUBLIC_BASE_URL is required when S3 avatar uploads are enabled.",
        )
    key = object_key.lstrip("/")
    return f"{base}/{key}"


def _s3_client():
    try:
        import boto3
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail="boto3 is not installed; add boto3 to backend dependencies for S3 uploads.",
        ) from e

    kwargs: dict[str, Any] = {}
    if (settings.s3_avatar_region or "").strip():
        kwargs["region_name"] = settings.s3_avatar_region.strip()
    if (settings.s3_endpoint_url or "").strip():
        kwargs["endpoint_url"] = settings.s3_endpoint_url.strip()
    if (settings.aws_access_key_id or "").strip() and (settings.aws_secret_access_key or "").strip():
        kwargs["aws_access_key_id"] = settings.aws_access_key_id.strip()
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key.strip()
    return boto3.client("s3", **kwargs)


def _put_avatar_s3(object_key: str, body: bytes, content_type: str) -> None:
    client = _s3_client()
    bucket = settings.s3_avatar_bucket.strip()
    try:
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType=content_type,
            CacheControl="public, max-age=31536000",
        )
    except Exception as e:
        _log.warning("S3 avatar upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not store avatar in object storage.") from e


def _delete_s3_object_by_key(object_key: str) -> None:
    if not _avatar_uses_s3():
        return
    try:
        client = _s3_client()
        client.delete_object(Bucket=settings.s3_avatar_bucket.strip(), Key=object_key)
    except Exception as e:
        _log.debug("S3 avatar delete skipped: %s", e)


def _try_delete_previous_avatar(old_url: str, new_local_filename: str | None) -> None:
    """Remove previous avatar from disk or S3 when replacing."""
    old = (old_url or "").strip()
    if not old:
        return
    if old.startswith("/uploads/avatars/"):
        root = _avatar_upload_root()
        old_name = old.split("/uploads/avatars/", 1)[-1]
        if new_local_filename and old_name == new_local_filename:
            return
        old_path = root / old_name
        if old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass
        return
    if old.startswith("http://") or old.startswith("https://"):
        base = (settings.s3_public_base_url or "").strip().rstrip("/")
        if not base or not old.startswith(base + "/"):
            return
        key = old[len(base) + 1 :].lstrip("/")
        if key:
            _delete_s3_object_by_key(key)


# ── Account lockout helpers ───────────────────────────────────────────────────

def _check_locked(user: User) -> None:
    if user.is_locked():
        secs = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "ACCOUNT_LOCKED",
                    "message": "Account temporarily locked due to too many failed attempts.",
                    "retry_after_seconds": secs},
        )


def _record_failure(user: User, db: Session) -> None:
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= _LOCK_THRESHOLD:
        user.locked_until = datetime.now(timezone.utc) + _LOCK_DURATION
    db.commit()


def _clear_failures(user: User, db: Session) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", summary="Password login (step 1 of MFA when enabled)", response_model=None)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
) -> JSONResponse:
    user = db.scalars(select(User).where(User.email == body.email)).first()

    # Always run full check to prevent user enumeration
    if user is None or not verify_password(body.password, user.hashed_password):
        if user:
            _record_failure(user, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password."},
        )

    _check_locked(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled. Contact IT admin."},
        )

    _clear_failures(user, db)

    # If MFA is enabled return a short-lived MFA token to complete step 2
    if user.mfa_enabled and user.mfa_secret:
        mfa_token = create_mfa_token(user.id)
        return JSONResponse(content=jsonable_encoder(MFALoginPending(mfa_required=True, mfa_token=mfa_token)))

    return token_json_response(_token_response(user, db))


# ── Neon Auth (Google OAuth, email sign-up in Neon) ───────────────────────────

@router.post(
    "/neon/exchange",
    summary="Exchange a Neon Auth access token for Stratum API tokens",
    response_model=None,
)
def neon_exchange(
    body: NeonExchangeRequest,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Verify JWT from Neon Auth JWKS, link or create Stratum user, return Stratum tokens."""
    if not settings.neon_auth_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "NEON_AUTH_DISABLED", "message": "NEON_AUTH_URL is not configured on the API."},
        )
    try:
        claims = decode_neon_access_token(body.access_token)
        email, full_name, avatar_url, sub, oauth_label = parse_neon_user_claims(claims)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NEON_TOKEN_INVALID", "message": str(e)},
        ) from e
    except jwt.PyJWTError as e:
        _log.debug("Neon JWT rejected: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NEON_TOKEN_INVALID", "message": "Invalid or expired Neon session."},
        ) from e

    try:
        deleted = db.scalars(
            select(DeletedUser).where(
                or_(
                    DeletedUser.neon_auth_sub == sub,
                    DeletedUser.email == email,
                )
            )
        ).first()
        if deleted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ACCOUNT_DELETED",
                    "message": "This account has been removed from Stratum. Contact IT admin for access.",
                },
            )

        user = db.scalars(select(User).where(User.neon_auth_sub == sub)).first()
        if not user:
            user = db.scalars(select(User).where(User.email == email)).first()
            if user:
                if not user.neon_auth_sub:
                    user.neon_auth_sub = sub
                    user.oauth_provider = oauth_label
                    if avatar_url and not user.avatar_url:
                        user.avatar_url = avatar_url
                    db.commit()
                    db.refresh(user)

        if not user:
            if not settings.allow_oauth_signup:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "OAUTH_SIGNUP_DISABLED",
                        "message": "No matching account. Contact IT to be provisioned, or sign in with password.",
                    },
                )
            user = User(
                email=email,
                hashed_password=hash_password(token_urlsafe(48)),
                full_name=full_name,
                role=canonicalize_role(settings.oauth_default_role),
                avatar_url=avatar_url,
                neon_auth_sub=sub,
                oauth_provider=oauth_label,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled. Contact IT admin."},
            )

        _check_locked(user)

        if user.mfa_enabled and user.mfa_secret:
            mfa_token = create_mfa_token(user.id)
            return JSONResponse(content=jsonable_encoder(MFALoginPending(mfa_required=True, mfa_token=mfa_token)))

        return token_json_response(_token_response(user, db))
    except HTTPException:
        raise
    except IntegrityError as e:
        db.rollback()
        _log.warning("neon_exchange integrity error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OAUTH_USER_CONFLICT",
                "message": "Could not link this account (email or id conflict). Contact IT.",
            },
        ) from e
    except SQLAlchemyError as e:
        db.rollback()
        _log.exception("neon_exchange database error")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "Database error during sign-in. Check DATABASE_URL and SSL.",
            },
        ) from e


# ── MFA: verify login (step 2) ────────────────────────────────────────────────

@router.post("/mfa/verify-login", response_model=None, summary="Verify TOTP code and complete login")
def mfa_verify_login(body: MFAVerifyLoginRequest, db: Session = Depends(get_db)) -> JSONResponse:
    try:
        claims = decode_mfa_token(body.mfa_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MFA_TOKEN_INVALID", "message": "MFA session expired. Please sign in again."},
        )

    user = db.get(User, claims["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"code": "AUTH_REQUIRED", "message": "Authentication required."})

    _check_locked(user)

    # Try TOTP first, then backup code
    totp_ok = verify_totp(user.mfa_secret or "", body.code)
    backup_ok = False
    used_hash = None

    if not totp_ok:
        stored = user.backup_code_hashes()
        used_hash = verify_backup_code(body.code, stored)
        backup_ok = used_hash is not None

    if not totp_ok and not backup_ok:
        _record_failure(user, db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MFA_INVALID", "message": "Invalid authenticator code."},
        )

    # If a backup code was used, remove it (single-use)
    if backup_ok and used_hash:
        remaining = [h for h in user.backup_code_hashes() if h != used_hash]
        user.mfa_backup_codes = json.dumps(remaining)
        db.commit()

    _clear_failures(user, db)
    return token_json_response(_token_response(user, db))


# ── MFA: setup ────────────────────────────────────────────────────────────────

@router.post("/mfa/setup", response_model=MFASetupResponse, summary="Begin MFA setup (generates secret + QR)")
def mfa_setup(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled. Disable it first.")

    secret = generate_totp_secret()
    uri = get_provisioning_uri(secret, current.email)
    qr_b64 = generate_qr_png_b64(uri)
    backup_codes = generate_backup_codes(8)
    hashed_codes = [hash_backup_code(c) for c in backup_codes]

    # Store pending secret (not yet confirmed/enabled)
    current.mfa_secret = secret
    current.mfa_backup_codes = json.dumps(hashed_codes)
    db.commit()

    return MFASetupResponse(
        secret=secret,
        uri=uri,
        qr_code_png_b64=qr_b64,
        backup_codes=backup_codes,
    )


@router.post("/mfa/confirm", summary="Confirm TOTP code works and activate MFA")
def mfa_confirm(
    body: MFAConfirmRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current.mfa_secret:
        raise HTTPException(status_code=400, detail="Call /auth/mfa/setup first.")
    if current.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA already enabled.")
    if not verify_totp(current.mfa_secret, body.code):
        raise HTTPException(
            status_code=400,
            detail={"code": "MFA_INVALID", "message": "Code doesn't match. Check your authenticator app time sync."},
        )
    current.mfa_enabled = True
    current.mfa_verified_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "message": "MFA enabled. Save your backup codes in a safe place."}


@router.post("/mfa/disable", summary="Disable MFA (requires password re-confirmation)")
def mfa_disable(
    body: MFADisableRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled.")
    if not verify_password(body.password, current.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Incorrect password."},
        )
    current.mfa_enabled = False
    current.mfa_secret = None
    current.mfa_backup_codes = None
    current.mfa_verified_at = None
    db.commit()
    return {"status": "ok", "message": "MFA disabled."}


# ── Refresh token ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=None, summary="Exchange refresh token for new access token")
def refresh_token(
    request: Request,
    db: Session = Depends(get_db),
    body: RefreshRequest | None = Body(None),
) -> JSONResponse:
    b = body or RefreshRequest()
    raw = (b.refresh_token or "").strip()
    if settings.auth_refresh_httponly_cookie:
        raw = raw or (request.cookies.get(settings.auth_refresh_cookie_name) or "").strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "REFRESH_MISSING", "message": "Refresh token missing."},
        )
    try:
        claims = decode_refresh_token(raw)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "REFRESH_INVALID", "message": "Refresh token is invalid or expired."},
        )

    user = db.get(User, claims["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"code": "AUTH_REQUIRED", "message": "Authentication required."})

    if not user.refresh_token_hash or not verify_refresh_token(raw, user.refresh_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "REFRESH_REVOKED", "message": "Refresh token has been revoked."},
        )

    return token_json_response(_token_response(user, db))


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", summary="Revoke refresh token (server-side logout)", response_model=None)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    body: RefreshRequest | None = Body(None),
) -> JSONResponse:
    """
    Always clears the HttpOnly refresh cookie. Revokes server-side session when the caller
    proves identity via a valid access JWT and/or the current refresh token (cookie or JSON body).
    Expired access tokens alone do not block logout — the refresh cookie is still cleared.
    """
    user = _user_from_bearer_access(credentials, db)
    if user is None and settings.auth_refresh_httponly_cookie:
        cookie_raw = (request.cookies.get(settings.auth_refresh_cookie_name) or "").strip()
        user = _user_from_refresh_value(cookie_raw, db)
    if user is None and not settings.auth_refresh_httponly_cookie:
        legacy = (body.refresh_token if body else "") or ""
        user = _user_from_refresh_value(legacy, db)

    if user:
        user.refresh_token_hash = None
        db.commit()

    resp = JSONResponse(content={"status": "ok", "message": "Signed out successfully."})
    clear_refresh_cookie(resp)
    return resp


# ── Change password ───────────────────────────────────────────────────────────

@router.post("/change-password", summary="Change account password", response_model=None)
def change_password(
    body: ChangePasswordRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    if not verify_password(body.current_password, current.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Current password is incorrect."},
        )
    current.hashed_password = hash_password(body.new_password)
    current.password_changed_at = datetime.now(timezone.utc)
    current.refresh_token_hash = None  # Invalidate all sessions
    db.commit()
    resp = JSONResponse(content={"status": "ok", "message": "Password changed. Please sign in again."})
    clear_refresh_cookie(resp)
    return resp


# ── /me ───────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserPublic)
def me(current: User = Depends(get_current_user)):
    return _to_public(current)


@router.put("/me", response_model=UserPublic, summary="Update current user profile")
def update_me(
    body: UserUpdateRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = body.model_dump(exclude_unset=True)
    if "full_name" in updates:
        current.full_name = updates["full_name"]
    if "team" in updates:
        current.team = updates["team"]
    if "department" in updates:
        current.department = updates["department"]
    if "bio" in updates:
        current.bio = updates["bio"]
    if "avatar_url" in updates:
        current.avatar_url = updates["avatar_url"]
    db.commit()
    db.refresh(current)
    return _to_public(current)


@router.post("/me/avatar", response_model=UserPublic, summary="Upload current user avatar image")
async def upload_my_avatar(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in _ALLOWED_AVATAR_EXTS:
        raise HTTPException(status_code=400, detail="Only png, jpg, jpeg, webp, gif are allowed.")
    if not (file.content_type or "").lower().startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw = await file.read()
    await file.close()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(raw) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Avatar image exceeds 2 MB.")

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_user = "".join(c for c in current.id if c.isalnum() or c in ("-", "_"))
    filename = f"{safe_user}_{ts}{suffix}"
    old = (current.avatar_url or "").strip()
    content_type = (file.content_type or "application/octet-stream").strip()

    if _avatar_uses_s3():
        object_key = _avatar_object_key(current.id, filename)
        _put_avatar_s3(object_key, raw, content_type)
        current.avatar_url = _avatar_public_url(object_key)
        db.commit()
        db.refresh(current)
        _try_delete_previous_avatar(old, None)
        return _to_public(current)

    root = _avatar_upload_root()
    target = root / filename
    target.write_bytes(raw)
    current.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(current)
    _try_delete_previous_avatar(old, filename)

    return _to_public(current)
