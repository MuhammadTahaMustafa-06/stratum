/**
 * Raw Better Auth client (Neon-hosted). Used for APIs not wrapped by the Supabase-compatible adapter
 * (e.g. resetPassword after email link — see Better Auth email-password docs).
 */
import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla";

const url = import.meta.env.VITE_NEON_AUTH_URL?.trim() || "";

export const isNeonBetterAuthVanillaConfigured = Boolean(url);

export const neonBetterAuthVanilla = isNeonBetterAuthVanillaConfigured
  ? createAuthClient(url, { adapter: BetterAuthVanillaAdapter() })
  : null;
