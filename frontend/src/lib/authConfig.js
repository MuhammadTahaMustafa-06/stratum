/**
 * HttpOnly refresh cookie mode (default on in dev and prod).
 * Set VITE_AUTH_REFRESH_COOKIE=false to use JSON refresh_token + localStorage instead.
 */
const raw = import.meta.env.VITE_AUTH_REFRESH_COOKIE;
export const authRefreshUsesCookie = String(raw ?? "true").toLowerCase() !== "false";
