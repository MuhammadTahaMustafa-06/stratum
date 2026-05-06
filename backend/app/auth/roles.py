"""Canonical role constants and portal access policy."""

# Canonical role model aligned to KMS plan
EMPLOYEE = "employee"
DOMAIN_EXPERT = "domain_expert"
KNOWLEDGE_ADMIN = "knowledge_admin"
SYSTEM_ADMIN = "system_admin"

ALL_ROLES = frozenset({EMPLOYEE, DOMAIN_EXPERT, KNOWLEDGE_ADMIN, SYSTEM_ADMIN})

PORTAL_KNOWLEDGE = "knowledge"
PORTAL_PROFILE = "profile"
PORTAL_ADMIN = "admin"

# Which portals each role may enter (UI + coarse API grouping)
ROLE_PORTALS: dict[str, frozenset[str]] = {
    EMPLOYEE: frozenset({PORTAL_KNOWLEDGE, PORTAL_PROFILE}),
    DOMAIN_EXPERT: frozenset({PORTAL_KNOWLEDGE, PORTAL_PROFILE}),
    KNOWLEDGE_ADMIN: frozenset({PORTAL_KNOWLEDGE, PORTAL_PROFILE, PORTAL_ADMIN}),
    SYSTEM_ADMIN: frozenset({PORTAL_KNOWLEDGE, PORTAL_PROFILE, PORTAL_ADMIN}),
}

# Backward compatibility with already-seeded legacy role values
LEGACY_TO_CANONICAL: dict[str, str] = {
    "knowledge_user": EMPLOYEE,
    "operations": DOMAIN_EXPERT,
    "compliance": DOMAIN_EXPERT,
    "content_editor": KNOWLEDGE_ADMIN,
    "platform_admin": SYSTEM_ADMIN,
}


def canonicalize_role(role: str) -> str:
    normalized = (role or "").strip().lower()
    return LEGACY_TO_CANONICAL.get(normalized, normalized)


def portals_for_role(role: str) -> list[str]:
    return sorted(ROLE_PORTALS.get(canonicalize_role(role), frozenset()))


def role_can_access_portal(role: str, portal: str) -> bool:
    return portal in ROLE_PORTALS.get(canonicalize_role(role), frozenset())
