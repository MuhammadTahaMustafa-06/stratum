from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import roles as role_defs
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

security = HTTPBearer(auto_error=False)


def _auth_error(message: str, code: str, status_code: int = status.HTTP_401_UNAUTHORIZED) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _auth_error("Sign in is required to use this endpoint.", "AUTH_REQUIRED")
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        token_type = payload.get("typ")
        if not user_id or not isinstance(user_id, str) or token_type != "access":
            raise _auth_error("Session token is invalid.", "INVALID_TOKEN")
    except jwt.PyJWTError:
        raise _auth_error("Session expired or invalid. Please sign in again.", "TOKEN_EXPIRED")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _auth_error("Account is inactive or no longer exists.", "ACCOUNT_INACTIVE")
    return user


def require_roles(*allowed_roles: str) -> Callable[..., User]:
    allowed = frozenset(role_defs.canonicalize_role(r) for r in allowed_roles)

    def _inner(user: User = Depends(get_current_user)) -> User:
        if role_defs.canonicalize_role(user.role) not in allowed:
            raise _auth_error(
                "Your role is not allowed to perform this action.",
                "RBAC_FORBIDDEN",
                status.HTTP_403_FORBIDDEN,
            )
        return user

    return _inner


def require_portal(portal: str) -> Callable[..., User]:
    def _inner(user: User = Depends(get_current_user)) -> User:
        if not role_defs.role_can_access_portal(user.role, portal):
            raise _auth_error(
                f"Portal '{portal}' is not enabled for your role.",
                "PORTAL_FORBIDDEN",
                status.HTTP_403_FORBIDDEN,
            )
        return user

    return _inner


# Common dependency bundles
require_knowledge_access = require_portal(role_defs.PORTAL_KNOWLEDGE)
require_sources_admin = require_roles(role_defs.KNOWLEDGE_ADMIN, role_defs.SYSTEM_ADMIN)
require_platform_admin = require_roles(role_defs.SYSTEM_ADMIN)
require_knowledge_admin = require_roles(role_defs.KNOWLEDGE_ADMIN, role_defs.SYSTEM_ADMIN)
require_domain_expert = require_roles(role_defs.DOMAIN_EXPERT, role_defs.KNOWLEDGE_ADMIN, role_defs.SYSTEM_ADMIN)
