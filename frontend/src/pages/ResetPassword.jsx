import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { validateNewUserPassword } from "../lib/validation";
import { parseApiError } from "../utils/apiError";
import {
  isNeonBetterAuthVanillaConfigured,
  neonBetterAuthVanilla,
} from "../lib/neonBetterAuthVanilla";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";
import { notifyError, notifySuccess } from "../lib/notify";

function readTokenAndError() {
  const qp = new URLSearchParams(window.location.search);
  return {
    token: qp.get("token"),
    errorCode: qp.get("error"),
  };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { token: initialToken, errorCode: initialError } = useMemo(() => readTokenAndError(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    initialError ? "This reset link is invalid or has expired. Request a new one." : null
  );
  const [fieldErrors, setFieldErrors] = useState({ password: null, confirm: null });
  const [done, setDone] = useState(false);

  const token = initialToken;

  const flashError = useCallback((message) => {
    setError(message);
    if (message) notifyError(message);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const pe = validateNewUserPassword(password);
    const ce =
      password !== confirm ? "Passwords do not match." : !confirm ? "Confirm your password." : null;
    setFieldErrors({ password: pe, confirm: ce });
    if (pe || ce) return;
    if (!token) {
      flashError("Missing reset token. Open the link from your email again.");
      return;
    }
    if (!isNeonBetterAuthVanillaConfigured || !neonBetterAuthVanilla) {
      flashError("Neon Auth is not configured.");
      return;
    }
    const reset = neonBetterAuthVanilla.resetPassword;
    if (typeof reset !== "function") {
      flashError("Password reset is not available from this client version.");
      return;
    }
    setLoading(true);
    try {
      const { error: rErr } = await reset.call(neonBetterAuthVanilla, {
        newPassword: password,
        token,
      });
      if (rErr) {
        flashError(rErr.message || "Could not reset password.");
        return;
      }
      setDone(true);
      notifySuccess("Password updated. Redirecting to sign in…");
      window.setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{`Set new password — ${BRAND.name}`}</title>
      </Helmet>
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/25">
              <StratumMark variant="knockout" size={24} decorative />
            </div>
            <span className="font-display font-semibold text-sm text-foreground">{BRAND.name}</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1.5">Set a new password</h2>
          <p className="text-sm text-secondary mb-6">
            Choose a strong password. After saving, sign in with email and this password.
          </p>

          {done ? (
            <p className="text-sm text-foreground mb-6">
              Password updated. Redirecting to sign in…
            </p>
          ) : !token && !initialError ? (
            <p className="text-sm text-foreground mb-6" role="alert">
              Open the reset link from your email. If it expired, request a new link from the forgot
              password page.
            </p>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
                >
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="rp-password" className="block text-xs font-medium text-foreground mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="rp-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldErrors((f) => ({ ...f, password: null }));
                      }}
                      required
                      autoComplete="new-password"
                      className={`w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border bg-surface ${
                        fieldErrors.password ? "border-red-400" : "border-border"
                      }`}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-secondary hover:text-foreground"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-[11px] text-red-600 mt-1" role="alert">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="rp-confirm" className="block text-xs font-medium text-foreground mb-1.5">
                    Confirm password
                  </label>
                  <input
                    id="rp-confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setFieldErrors((f) => ({ ...f, confirm: null }));
                    }}
                    required
                    autoComplete="new-password"
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-surface ${
                      fieldErrors.confirm ? "border-red-400" : "border-border"
                    }`}
                  />
                  {fieldErrors.confirm && (
                    <p className="text-[11px] text-red-600 mt-1" role="alert">
                      {fieldErrors.confirm}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading || !token || Boolean(initialError)}
                  className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={15} className="portal-animate-spin" />}
                  {loading ? "Saving…" : "Save password"}
                </button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-secondary">
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Back to sign in
            </Link>
            {" · "}
            <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
              Request new link
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
