export const ROLES = {
  EMPLOYEE: "employee",
  DOMAIN_EXPERT: "domain_expert",
  KNOWLEDGE_ADMIN: "knowledge_admin",
  SYSTEM_ADMIN: "system_admin",
};

export const PORTAL = {
  KNOWLEDGE: "knowledge",
  PROFILE: "profile",
  ADMIN: "admin",
};

export const ROLE_LABELS = {
  employee: "Banking Professional",
  domain_expert: "Subject Matter Expert",
  knowledge_admin: "Content Manager",
  system_admin: "Platform Administrator",
};

export const PORTAL_LABELS_BY_ROLE = {
  [ROLES.KNOWLEDGE_ADMIN]: {
    [PORTAL.ADMIN]: {
      label: "Content Management",
      shortLabel: "Content",
      description: "Knowledge article workflow",
      surface: "Content Management",
    },
  },
  [ROLES.SYSTEM_ADMIN]: {
    [PORTAL.ADMIN]: {
      label: "Platform Admin",
      shortLabel: "Admin",
      description: "Platform administration",
      surface: "Admin Console",
    },
  },
};

// Portal access fallback used only before the API-provided `user.portals` is available.
export const ROLE_PORTALS = {
  employee: ["knowledge", "profile"],
  domain_expert: ["knowledge", "profile"],
  knowledge_admin: ["knowledge", "profile", "admin"],
  system_admin: ["knowledge", "profile", "admin"],
};

export function hasPortalAccess(user, portal) {
  if (!user) return false;
  // The API returns DB-derived portals; prefer it so URL/UI access cannot drift from backend RBAC.
  if (Array.isArray(user.portals)) return user.portals.includes(portal);
  return (ROLE_PORTALS[user.role] || []).includes(portal);
}

export function isAdmin(user) {
  return user?.role === ROLES.SYSTEM_ADMIN || user?.role === ROLES.KNOWLEDGE_ADMIN;
}

/** Platform user CRUD (list/create via /admin/users) is restricted to system admins. */
export function isSystemAdmin(user) {
  return user?.role === ROLES.SYSTEM_ADMIN;
}

/** Article create/update/delete/submit/archive: knowledge_admin or system_admin with admin portal. */
export function canManageContent(user) {
  return isAdmin(user) && hasPortalAccess(user, PORTAL.ADMIN);
}

/** PDF/source maintenance: same role and portal contract as backend require_sources_admin. */
export function canManageSources(user) {
  return canManageContent(user);
}

/** Platform telemetry, reindex, accounts: system_admin with admin portal. */
export function canManagePlatform(user) {
  return isSystemAdmin(user) && hasPortalAccess(user, PORTAL.ADMIN);
}

export function canApproveArticles(user) {
  return [ROLES.DOMAIN_EXPERT, ROLES.KNOWLEDGE_ADMIN, ROLES.SYSTEM_ADMIN].includes(user?.role);
}

export function getPortalDisplay(user, portal) {
  return PORTAL_LABELS_BY_ROLE[user?.role]?.[portal] || {};
}

export function getPortalLabel(user, portal, fallback) {
  return getPortalDisplay(user, portal).label || fallback;
}

export function getPortalDescription(user, portal, fallback) {
  return getPortalDisplay(user, portal).description || fallback;
}

export function getAdminSurfaceLabel(user) {
  return getPortalDisplay(user, PORTAL.ADMIN).surface || "Admin Console";
}
