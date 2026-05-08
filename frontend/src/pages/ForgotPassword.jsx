import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { validateEmail } from "../lib/validation";
import { parseApiError } from "../utils/apiError";
import { isNeonAuthConfigured, neonAuth } from "../lib/neonAuthClient";
import { getPasswordResetRedirectTo } from "../lib/oauthRedirect";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";
import { notifyError, notifySuccess } from "../lib/notify";
import { USER_MESSAGES } from "../lib/userMessages";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState(null);

  const flashError = useCallback((message) => {
    setError(message);
    if (message) notifyError(message);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const ee = validateEmail(email);
    setFieldError(ee);
    if (ee) return;
    if (!isNeonAuthConfigured || !neonAuth) {
      flashError(USER_MESSAGES.passwordResetUnavailable);
      return;
    }
    const reset = neonAuth.resetPasswordForEmail;
    if (typeof reset !== "function") {
      flashError("Password reset is not available from this client version.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = getPasswordResetRedirectTo();
      const { error: neErr } = await reset.call(neonAuth, email.trim().toLowerCase(), { redirectTo });
      if (neErr) {
        flashError(neErr.message || "Could not send reset email.");
        return;
      }
      setSent(true);
      notifySuccess("If an account exists for that email, check your inbox for reset instructions.");
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{`Forgot password — ${BRAND.name}`}</title>
      </Helmet>
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/25">
              <StratumMark variant="knockout" size={24} decorative />
            </div>
            <span className="font-display font-semibold text-sm text-foreground">{BRAND.name}</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1.5">Reset password</h2>
          <p className="text-sm text-secondary mb-6">
            Neon Auth sends a reset link to your email. After resetting, sign in again here.
          </p>

          {sent ? (
            <p className="text-sm text-foreground mb-6">
              If an account exists for that email, Neon sent reset instructions. Check your inbox.
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
                  <label htmlFor="fp-email" className="block text-xs font-medium text-foreground mb-1.5">
                    Email
                  </label>
                  <input
                    id="fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldError(null);
                    }}
                    required
                    autoComplete="email"
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-surface ${
                      fieldError ? "border-red-400" : "border-border"
                    }`}
                  />
                  {fieldError && (
                    <p className="text-[11px] text-red-600 mt-1" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={15} className="portal-animate-spin" />}
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-secondary">
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
