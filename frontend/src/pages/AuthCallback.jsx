import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, AlertCircle } from "lucide-react";
import { neonAuth, isNeonAuthConfigured } from "../lib/neonAuthClient";
import { exchangeNeonForStratum } from "../lib/neonStratumBridge";
import { useAuth } from "../context/AuthContext";
import { parseApiError } from "../utils/apiError";
import { notifyError } from "../lib/notify";
import { BRAND } from "../lib/brand";
import { clearStoredSession } from "../lib/authTokens";

const SESSION_WAIT_MS = 15000;
const POLL_MS = 250;

async function waitForNeonSession(client, signal) {
  const deadline = Date.now() + SESSION_WAIT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const { data, error } = await client.getSession();
    if (error) throw error;
    if (data?.session?.access_token) return data.session;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(
    "No Neon Auth session after redirect. Check Neon Console → Auth → domains (localhost) and redirect URLs."
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { loginWithToken, user } = useAuth();
  const [error, setError] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (user) {
      navigate("/portal/knowledge", { replace: true });
      return;
    }

    const qp = new URLSearchParams(window.location.search);
    const oauthErr = qp.get("error_description") || qp.get("error");
    if (oauthErr) {
      try {
        const decoded = decodeURIComponent(oauthErr.replace(/\+/g, " "));
        setError(decoded);
        notifyError(decoded);
      } catch {
        setError(oauthErr);
        notifyError(oauthErr);
      }
      return;
    }

    if (!isNeonAuthConfigured || !neonAuth) {
      const msg =
        "Neon Auth is not configured. Set VITE_NEON_AUTH_URL in frontend/.env.local (same Auth URL as Neon Console) and NEON_AUTH_URL on the API.";
      setError(msg);
      notifyError(msg);
      return;
    }
    if (ran.current) return;
    ran.current = true;

    const ac = new AbortController();

    (async () => {
      try {
        clearStoredSession();

        const session = await waitForNeonSession(neonAuth, ac.signal);
        await exchangeNeonForStratum(session.access_token, { loginWithToken, navigate, neonAuth });
      } catch (e) {
        if (e?.name === "AbortError") return;
        const msg = parseApiError(e) || "Sign-in failed.";
        setError(msg);
        notifyError(msg);
        try {
          await neonAuth.signOut();
        } catch {
          /* ignore */
        }
      }
    })();

    return () => ac.abort();
  }, [user, navigate, loginWithToken]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <Helmet>
        <title>{`Completing sign-in — ${BRAND.name}`}</title>
      </Helmet>
      {!error ? (
        <div className="flex flex-col items-center gap-4 text-secondary">
          <Loader2 className="portal-animate-spin text-primary" size={28} aria-hidden="true" />
          <p className="text-sm">Completing secure sign-in…</p>
        </div>
      ) : (
        <div
          role="alert"
          className="max-w-md w-full app-card p-6 flex flex-col gap-4 items-center text-center"
        >
          <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
          <p className="text-xs text-secondary max-w-sm leading-relaxed">
            Use the same Auth URL in <code className="text-[11px]">NEON_AUTH_URL</code> and{" "}
            <code className="text-[11px]">VITE_NEON_AUTH_URL</code> as in Neon Console → Auth.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Back to sign in
          </button>
        </div>
      )}
    </div>
  );
}
