import { PORTAL, ROLES } from './roles';

const BASE = {
    [PORTAL.KNOWLEDGE]: [
        'Articles and playbooks by domain',
        'Assistant answers cite sources',
    ],
    [PORTAL.ADMIN]: [
        'Source health and reindex',
        'Article and user workflows',
    ],
};

const ROLE_OVERRIDES = {
    [ROLES.EMPLOYEE]: {
        label: 'Employee',
        focus: 'Search and use governed knowledge.',
        portals: [PORTAL.KNOWLEDGE],
        extras: ['Filter by domain', 'Rate answers and flag gaps'],
    },
    [ROLES.DOMAIN_EXPERT]: {
        label: 'Domain Expert',
        focus: 'Validate domain content and flag stale material.',
        portals: [PORTAL.KNOWLEDGE],
        extras: ['Review complex guidance', 'Mark outdated articles'],
    },
    [ROLES.KNOWLEDGE_ADMIN]: {
        label: 'Knowledge Admin',
        focus: 'Own taxonomy, review, and publication.',
        portals: [PORTAL.KNOWLEDGE, PORTAL.ADMIN],
        extras: ['Draft → review → publish', 'Metadata and glossary'],
    },
    [ROLES.SYSTEM_ADMIN]: {
        label: 'System Admin',
        focus: 'Security, access, and platform health.',
        portals: [PORTAL.KNOWLEDGE, PORTAL.ADMIN],
        extras: ['Indexing and audit signals', 'RBAC'],
    },
};

export function getRolePlan(role) {
    return (
        ROLE_OVERRIDES[role] || {
            label: 'Employee',
            focus: 'Search and use governed knowledge.',
            portals: [PORTAL.KNOWLEDGE],
            extras: [],
        }
    );
}

export function getPortalFeatures(portal, role) {
    const plan = getRolePlan(role);
    const base = BASE[portal] || [];
    const scoped = plan.portals.includes(portal)
        ? [plan.focus, ...base]
        : ['This role does not have access to this portal.'];
    return scoped;
}
