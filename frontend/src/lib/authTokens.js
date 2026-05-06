/** Stratum API session — localStorage keys (SPA; pair with short-lived access + refresh rotation). */

import { authRefreshUsesCookie } from "./authConfig";

export const ACCESS_TOKEN_KEY = "stratum_token";
export const REFRESH_TOKEN_KEY = "stratum_refresh";

export function getStoredAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken() {
  if (authRefreshUsesCookie) return null;
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** True if we can call POST /auth/refresh (cookie or stored refresh). */
export function canRefreshSession() {
  if (authRefreshUsesCookie) return true;
  return Boolean(getStoredRefreshToken());
}

/** Persist tokens from login / refresh responses. */
export function persistSession(payload) {
  try {
    if (authRefreshUsesCookie) {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    if (payload?.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, payload.access_token);
    if (!authRefreshUsesCookie && payload?.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token);
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* */
  }
}

/**
 * Read JWT `exp` (milliseconds) for client-side scheduling only — not cryptographically verified.
 */
export function decodeAccessTokenExpiryMs(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    let payload = parts[1];
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}
