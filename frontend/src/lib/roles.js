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

// Two portals: knowledge (everyone) + admin (admins only)
export const ROLE_PORTALS = {
  employee: ["knowledge", "profile"],
  domain_expert: ["knowledge", "profile", "admin"],
  knowledge_admin: ["knowledge", "profile", "admin"],
  system_admin: ["knowledge", "profile", "admin"],
};

export function hasPortalAccess(user, portal) {
  if (!user) return false;
  const backendPortals = Array.isArray(user.portals) ? user.portals : [];
  const rolePortals = ROLE_PORTALS[user.role] || [];
  const portals = new Set([...backendPortals, ...rolePortals]);
  return portals.has(portal);
}

export function isAdmin(user) {
  return user?.role === ROLES.SYSTEM_ADMIN || user?.role === ROLES.KNOWLEDGE_ADMIN;
}

/** Platform user CRUD (list/create via /admin/users) is restricted to system admins. */
export function isSystemAdmin(user) {
  return user?.role === ROLES.SYSTEM_ADMIN;
}

export function canApproveArticles(user) {
  return user?.role !== ROLES.EMPLOYEE;
}
