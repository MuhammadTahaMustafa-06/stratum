/** Neon Auth — `VITE_NEON_AUTH_URL` must match Neon Console → Auth URL. */
import { createAuthClient } from "@neondatabase/auth";
// SDK export name — OAuth/session surface compatible with Neon Auth hosted endpoints.
import { SupabaseAuthAdapter as NeonAuthSessionAdapter } from "@neondatabase/auth/vanilla";

const url = import.meta.env.VITE_NEON_AUTH_URL?.trim() || "";

export const isNeonAuthConfigured = Boolean(url);

export const neonAuth = isNeonAuthConfigured
  ? createAuthClient(url, { adapter: NeonAuthSessionAdapter() })
  : null;
