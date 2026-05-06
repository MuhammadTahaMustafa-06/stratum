import { exchangeNeonToken } from "../api/client";

/**
 * Exchange Neon access JWT for Stratum API tokens; clear Neon browser session after success.
 */
export async function exchangeNeonForStratum(accessToken, { loginWithToken, navigate, neonAuth }) {
  const res = await exchangeNeonToken(accessToken);
  if (res?.mfa_required && res?.mfa_token) {
    sessionStorage.setItem("mfa_temp_token", res.mfa_token);
    try {
      await neonAuth?.signOut?.();
    } catch {
      /* ignore */
    }
    navigate("/mfa", { replace: true });
    return;
  }
  loginWithToken(res);
  try {
    await neonAuth?.signOut?.();
  } catch {
    /* ignore */
  }
  navigate("/portal/knowledge", { replace: true });
}
