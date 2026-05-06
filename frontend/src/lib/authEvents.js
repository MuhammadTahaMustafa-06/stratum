/** Document events for coordinating auth across axios, React, and optional BroadcastChannel. */

export const AUTH_EXPIRED_EVENT = "stratum-auth-expired";
export const AUTH_REFRESHED_EVENT = "stratum-auth-refreshed";

/** @param {Record<string, unknown>} [detail] — e.g. { access_token, refresh_token, user } from /auth/refresh */
export function emitAuthRefreshed(detail) {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_REFRESHED_EVENT, { detail: detail ?? {} }));
  } catch {
    /* */
  }
}

export function emitAuthExpired() {
  try {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  } catch {
    /* */
  }
}

const BROADCAST_NAME = "stratum-auth-sync";

export function broadcastSessionLogout() {
  try {
    const bc = new BroadcastChannel(BROADCAST_NAME);
    bc.postMessage({ type: "logout", t: Date.now() });
    bc.close();
  } catch {
    /* */
  }
}

/** @param {() => void} onLogout */
export function subscribeSessionBroadcast(onLogout) {
  try {
    const bc = new BroadcastChannel(BROADCAST_NAME);
    bc.onmessage = (ev) => {
      if (ev?.data?.type === "logout") onLogout();
    };
    return () => {
      try {
        bc.close();
      } catch {
        /* */
      }
    };
  } catch {
    return () => {};
  }
}
