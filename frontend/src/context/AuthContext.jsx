import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { login as apiLogin, getMe, refreshStratumSession, logoutApi } from "../api/client";
import { neonAuth, isNeonAuthConfigured } from "../lib/neonAuthClient";
import {
  getStoredAccessToken,
  persistSession,
  clearStoredSession,
  decodeAccessTokenExpiryMs,
  canRefreshSession,
} from "../lib/authTokens";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_REFRESHED_EVENT,
  emitAuthExpired,
  broadcastSessionLogout,
  subscribeSessionBroadcast,
} from "../lib/authEvents";

const AuthContext = createContext(null);

/** Refresh access token this long before JWT exp (client clock). */
const PROACTIVE_SKEW_MS = 120_000;
const PROACTIVE_MIN_DELAY_MS = 15_000;
const PROACTIVE_MAX_DELAY_MS = 86_400_000;
const VISIBILITY_REFRESH_IF_EXPIRES_WITHIN_MS = 120_000;

function scheduleAccessRefresh(onFire, accessToken, timerRef) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  const expMs = decodeAccessTokenExpiryMs(accessToken);
  if (!expMs) return;

  let delay = expMs - Date.now() - PROACTIVE_SKEW_MS;
  if (delay < PROACTIVE_MIN_DELAY_MS) delay = PROACTIVE_MIN_DELAY_MS;
  if (delay > PROACTIVE_MAX_DELAY_MS) delay = PROACTIVE_MAX_DELAY_MS;

  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    void onFire();
  }, delay);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const proactiveTimerRef = useRef(null);

  const clearProactiveTimer = useCallback(() => {
    if (proactiveTimerRef.current) {
      clearTimeout(proactiveTimerRef.current);
      proactiveTimerRef.current = null;
    }
  }, []);

  const runRefreshRotation = useCallback(async () => {
    if (!canRefreshSession()) {
      clearStoredSession();
      setUser(null);
      emitAuthExpired();
      return;
    }
    try {
      const data = await refreshStratumSession();
      if (data.user) setUser(data.user);
      const at = getStoredAccessToken();
      if (at) scheduleAccessRefresh(runRefreshRotation, at, proactiveTimerRef);
    } catch {
      setUser(null);
      clearProactiveTimer();
    }
  }, [clearProactiveTimer]);

  const applySessionPayload = useCallback(
    (data) => {
      persistSession(data);
      if (data.user) setUser(data.user);
      const at = data.access_token || getStoredAccessToken();
      if (at) scheduleAccessRefresh(runRefreshRotation, at, proactiveTimerRef);
    },
    [runRefreshRotation]
  );

  const refreshUser = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      clearProactiveTimer();
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
      scheduleAccessRefresh(runRefreshRotation, token, proactiveTimerRef);
    } catch {
      if (canRefreshSession()) {
        try {
          const data = await refreshStratumSession();
          applySessionPayload(data);
        } catch {
          setUser(null);
          clearProactiveTimer();
        }
      } else {
        clearStoredSession();
        setUser(null);
        clearProactiveTimer();
      }
    } finally {
      setLoading(false);
    }
  }, [applySessionPayload, clearProactiveTimer, runRefreshRotation]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handler = () => {
      clearStoredSession();
      setUser(null);
      setLoading(false);
      clearProactiveTimer();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [clearProactiveTimer]);

  useEffect(() => {
    const onRefreshed = (e) => {
      const d = e.detail;
      if (d?.user) setUser(d.user);
      const at = d?.access_token || getStoredAccessToken();
      if (at) scheduleAccessRefresh(runRefreshRotation, at, proactiveTimerRef);
    };
    window.addEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
  }, [runRefreshRotation]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const at = getStoredAccessToken();
      if (!at || !canRefreshSession()) return;
      const exp = decodeAccessTokenExpiryMs(at);
      if (!exp) return;
      if (exp - Date.now() < VISIBILITY_REFRESH_IF_EXPIRES_WITHIN_MS) {
        void runRefreshRotation();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [runRefreshRotation]);

  useEffect(() => {
    const unsub = subscribeSessionBroadcast(() => {
      clearStoredSession();
      setUser(null);
      clearProactiveTimer();
      setLoading(false);
    });
    return unsub;
  }, [clearProactiveTimer]);

  useEffect(() => () => clearProactiveTimer(), [clearProactiveTimer]);

  /**
   * login() — handles both plain and MFA-pending responses.
   * Returns { user } on success, or { mfa_required, mfa_token } if MFA is needed.
   */
  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    if (data.mfa_required) {
      return data;
    }
    applySessionPayload(data);
    return data;
  };

  const completeMfaLogin = async (mfa_token, code) => {
    const { verifyMfaLogin } = await import("../api/client");
    const data = await verifyMfaLogin(mfa_token, code);
    applySessionPayload(data);
    return data.user;
  };

  const loginWithToken = (data) => {
    applySessionPayload(data);
    return data.user;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      /* ignore */
    }
    try {
      if (isNeonAuthConfigured && neonAuth?.signOut) await neonAuth.signOut();
    } catch {
      /* ignore */
    }
    broadcastSessionLogout();
    clearProactiveTimer();
    clearStoredSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        completeMfaLogin,
        loginWithToken,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
