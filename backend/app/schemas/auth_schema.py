from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


def _password_strength(v: str) -> str:
    v = v.strip()
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if len(v) > 256:
        raise ValueError("Password must be at most 256 characters.")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit.")
    if not any(c.islower() for c in v):
        raise ValueError("Password must contain at least one lowercase letter.")
    return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=256)]

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return str(v).lower().strip()


class UserPublic(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    team: Optional[str] = None
    department: Optional[str] = None
    expertise_tags: list[str] = Field(default_factory=list)
    portals: list[str] = Field(default_factory=list)
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool = True
    mfa_enabled: bool = False
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    team: Optional[str] = None
    department: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("Full name cannot be empty.")
        if len(s) > 255:
            raise ValueError("Full name must be at most 255 characters.")
        return s

    @field_validator("team", "department")
    @classmethod
    def normalize_short_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        return s[:128]

    @field_validator("bio")
    @classmethod
    def normalize_bio(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        return s[:1000]

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        # Stored paths from local upload are relative (e.g. /uploads/avatars/...); S3 uses https.
        if s.startswith("/uploads/") or s.startswith("uploads/"):
            norm = s if s.startswith("/") else f"/{s}"
            return norm[:512]
        if not (s.startswith("http://") or s.startswith("https://")):
            raise ValueError("Avatar URL must be http(s) or a path under /uploads/")
        return s[:512]


# ── Standard token response (full login) ──────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 3600
    user: UserPublic


# ── MFA-interrupted login ─────────────────────────────────────────────────────

class MFALoginPending(BaseModel):
    """Returned when the user's account requires MFA verification."""
    mfa_required: bool = True
    mfa_token: str   # short-lived token to pass back at /auth/mfa/verify-login


# ── MFA verify-login ──────────────────────────────────────────────────────────

class MFAVerifyLoginRequest(BaseModel):
    mfa_token: Annotated[str, Field(min_length=10, max_length=2048)]
    code: Annotated[str, Field(min_length=6, max_length=32)]

    @field_validator("code")
    @classmethod
    def strip_and_shape_code(cls, v: str) -> str:
        s = v.strip().replace(" ", "").replace("-", "")
        if len(s) == 6 and s.isdigit():
            return s
        if 8 <= len(s) <= 12 and s.isalnum():
            return s.upper()
        raise ValueError("Enter a 6-digit authenticator code or a valid backup code.")


# ── MFA setup ─────────────────────────────────────────────────────────────────

class MFASetupResponse(BaseModel):
    secret: str
    uri: str
    qr_code_png_b64: str   # base64-encoded PNG for display in <img>
    backup_codes: list[str]


class MFAConfirmRequest(BaseModel):
    code: Annotated[str, Field(min_length=6, max_length=6)]

    @field_validator("code")
    @classmethod
    def strip_code(cls, v: str) -> str:
        s = v.strip().replace(" ", "")
        if len(s) != 6 or not s.isdigit():
            raise ValueError("Enter the 6-digit code from your authenticator app.")
        return s


class MFADisableRequest(BaseModel):
    password: Annotated[str, Field(min_length=1, max_length=256)]


# ── Refresh token ─────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    """Body optional when refresh is sent as HttpOnly cookie (production)."""

    refresh_token: str = Field(default="", max_length=4096)


# ── Change password ───────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=256)]
    new_password: Annotated[str, Field(min_length=8, max_length=256)]

    @field_validator("new_password")
    @classmethod
    def validate_strength(cls, v: str) -> str:
        return _password_strength(v)


# ── Neon Auth OAuth token exchange ─────────────────────────────────────────────

class NeonExchangeRequest(BaseModel):
    access_token: Annotated[str, Field(min_length=20, max_length=8192)]

