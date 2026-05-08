import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { parseApiError } from "../utils/apiError";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notify";
import { exchangeNeonForStratum } from "../lib/neonStratumBridge";
import { neonAuth, isNeonAuthConfigured } from "../lib/neonAuthClient";
import {
  NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC,
  resendSignupVerificationEmail,
  verifySignupEmailOtp,
} from "../lib/neonEmailVerification";
import { validateEmail, validateNewUserPassword } from "../lib/validation";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";
import { USER_MESSAGES } from "../lib/userMessages";

const panelVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/** Neon / Supabase-style errors when email is already registered */
function isDuplicateAccountError(err) {
  if (!err || typeof err !== "object") return false;
  const msg = String(err.message ?? err.msg ?? "").toLowerCase();
  const code = String(err.code ?? "").toLowerCase();
  const status = err.status ?? err.statusCode;
  if (code === "user_already_registered" || code === "email_already_exists") return true;
  if (
    /already\s*(been\s*)?registered|already\s*exists|user\s*already|email\s*(address\s*)?(is\s*)?(already|in use|taken)|duplicate.*(user|email)|exists\s*with\s*(this\s*)?email/.test(
      msg
    )
  ) {
    return true;
  }
  if (status === 422 && /already|exists|registered|taken|duplicate/i.test(msg)) return true;
  return false;
}

export default function Signup() {
  const navigate = useNavigate();
  const { loginWithToken, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  /** Neon “Verify at sign-up” — user row exists but JWT session only after clicking email link */
  const [verificationPending, setVerificationPending] = useState(false);
  /** Second signup attempt after Neon already stored this email */
  const [accountExists, setAccountExists] = useState(false);
  /** Neon email OTP (6-digit code in verification email) */
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const flashError = useCallback((message) => {
    setError(message);
    if (message) notifyError(message);
  }, []);

  useEffect(() => {
    if (resendCooldownSec <= 0) return undefined;
    const t = setInterval(() => {
      setResendCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldownSec]);

  useEffect(() => {
    if (!user) return;
    navigate("/portal/knowledge", { replace: true });
  }, [user, navigate]);

  if (user) {
    return null;
  }

  if (!isNeonAuthConfigured || !neonAuth) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-background px-4 text-center sm:px-6">
        <Helmet>
          <title>{`Sign up — ${BRAND.name}`}</title>
        </Helmet>
        <p className="text-sm text-secondary text-center max-w-md">
          {USER_MESSAGES.signInUnavailable}
        </p>
        <Link to="/login" className="text-sm text-primary">
          Back to sign in
        </Link>
      </div>
    );
  }

  const runValidation = () => {
    const em = validateEmail(email);
    const pe = validateNewUserPassword(password);
    const ce = password !== confirm ? "Passwords do not match." : null;
    const nm = !name.trim() ? "Name is required." : null;
    setFieldErrors({ email: em, password: pe, confirm: ce, name: nm });
    return !em && !pe && !ce && !nm;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setVerificationPending(false);
    setAccountExists(false);
    if (!runValidation()) return;
    setLoading(true);
    try {
      const trimmedName = name.trim();
      const { data, error: upErr } = await neonAuth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            displayName: trimmedName,
            name: trimmedName,
            full_name: trimmedName,
          },
        },
      });
      if (upErr) {
        if (isDuplicateAccountError(upErr)) {
          setAccountExists(true);
          notifyWarning("This email may already be registered — try signing in.");
          return;
        }
        flashError(upErr.message || "Sign-up failed.");
        return;
      }

      const access = data?.session?.access_token;

      if (access) {
        await exchangeNeonForStratum(access, { loginWithToken, navigate, neonAuth });
        return;
      }

      // Sign-up succeeded on Neon but no JWT yet — almost always email verification (or Neon omitted user in payload).
      // Do not call getSession(); it often errors with “Failed to retrieve user session” even though the user was created.
      setVerificationPending(true);
      // Ensure a verification email is dispatched (some tenants only reliably deliver on sendVerificationEmail / resend).
      void (async () => {
        try {
          const { error: rErr } = await resendSignupVerificationEmail(neonAuth, email.trim().toLowerCase());
          if (rErr?.message) {
            flashError(
              `Account created. If you don't see a code in your inbox, use Resend below. (${rErr.message})`
            );
          } else {
            setResendCooldownSec(NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC);
            notifySuccess("Verification email sent.");
          }
        } catch (err) {
          flashError(parseApiError(err));
        }
      })();
    } catch (err) {
      const msg = parseApiError(err) || "Sign-up failed.";
      if (/already|exists|registered|taken|duplicate/i.test(String(msg))) {
        setAccountExists(true);
        notifyWarning("This email may already be registered — try signing in.");
      } else {
        flashError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setOtpLoading(true);
    try {
      const { accessToken, error: msg } = await verifySignupEmailOtp(neonAuth, email, otpCode);
      if (msg) {
        flashError(msg);
        return;
      }
      await exchangeNeonForStratum(accessToken, { loginWithToken, navigate, neonAuth });
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    if (resendCooldownSec > 0 || resendLoading) return;
    setResendLoading(true);
    try {
      const { error: rErr } = await resendSignupVerificationEmail(neonAuth, email);
      if (rErr?.message) {
        flashError(rErr.message);
        return;
      }
      setResendCooldownSec(NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC);
      notifySuccess("Verification email sent.");
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setResendLoading(false);
    }
  };

  const cancelVerificationStep = () => {
    setVerificationPending(false);
    setOtpCode("");
    setError(null);
  };

  return (
    <>
      <Helmet>
        <title>{`Create account — ${BRAND.name}`}</title>
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <motion.div
          className="w-full max-w-sm"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/25">
              <StratumMark variant="knockout" size={24} decorative />
            </div>
            <span className="font-display font-semibold text-sm text-foreground">{BRAND.name}</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1.5">Create account</h2>
          <p className="text-sm text-secondary mb-6">
            Uses Neon Auth only — email verification and password rules follow your Neon project settings.
          </p>

          {accountExists && (
            <div
              role="status"
              className="mb-5 px-3.5 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900"
            >
              <p className="text-xs text-amber-950 dark:text-amber-100 leading-relaxed">
                That email is already registered with Neon Auth — your first attempt likely succeeded.{" "}
                <Link to="/login" className="font-semibold underline underline-offset-2">
                  Sign in
                </Link>
                {" "}
                with your password; if your email isn&apos;t verified yet, you&apos;ll get a screen to enter the 6-digit
                code or resend it. Use{" "}
                <Link to="/forgot-password" className="font-semibold underline underline-offset-2">
                  Forgot password
                </Link>{" "}
                if you need to reset your password.
              </p>
            </div>
          )}

          {verificationPending && (
            <div className="mb-5 space-y-4">
              <div
                role="status"
                className="px-3.5 py-3 rounded-xl bg-sky-50 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800"
              >
                <p className="text-xs text-sky-900 dark:text-sky-100 leading-relaxed">
                  We&apos;re sending a 6-digit code to{" "}
                  <strong className="font-medium">{email.trim().toLowerCase()}</strong>. Enter it below (it expires in a
                  few minutes). Use Resend if nothing arrives.
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div>
                  <label htmlFor="su-otp" className="block text-xs font-medium text-foreground mb-1.5">
                    Verification code
                  </label>
                  <input
                    id="su-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full px-3.5 py-3 text-center text-xl font-mono tracking-[0.35em] rounded-xl border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={otpLoading || otpCode.replace(/\D/g, "").length !== 6}
                  className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {otpLoading && <Loader2 size={15} className="portal-animate-spin" />}
                  {otpLoading ? "Verifying…" : "Verify and continue"}
                </button>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldownSec > 0}
                  className="w-full py-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {resendLoading
                    ? "Sending…"
                    : resendCooldownSec > 0
                      ? `Resend code (${resendCooldownSec}s)`
                      : "Resend verification email"}
                </button>
                <button
                  type="button"
                  onClick={cancelVerificationStep}
                  className="w-full py-2 text-xs text-secondary hover:text-foreground"
                >
                  Use a different email
                </button>
              </form>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
            >
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={`space-y-4 ${verificationPending ? "hidden" : ""}`}>
            <div>
              <label htmlFor="su-name" className="block text-xs font-medium text-foreground mb-1.5">
                Full name
              </label>
              <input
                id="su-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface"
              />
              {fieldErrors.name && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="su-email" className="block text-xs font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="su-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface"
              />
              {fieldErrors.email && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label htmlFor="su-password" className="block text-xs font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="su-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-border bg-surface"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.password}</p>
              )}
            </div>
            <div>
              <label htmlFor="su-confirm" className="block text-xs font-medium text-foreground mb-1.5">
                Confirm password
              </label>
              <input
                id="su-confirm"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-border bg-surface"
              />
              {fieldErrors.confirm && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.confirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || verificationPending}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="portal-animate-spin" />}
              {loading ? "Creating…" : verificationPending ? "Check your email" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-secondary">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </>
  );
}
