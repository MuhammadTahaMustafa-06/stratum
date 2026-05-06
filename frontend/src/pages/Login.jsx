import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import { parseApiError } from "../utils/apiError";
import { notifyError, notifySuccess } from "../lib/notify";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { validateEmail } from "../lib/validation";
import { getOAuthRedirectTo } from "../lib/oauthRedirect";
import { isNeonAuthConfigured, neonAuth } from "../lib/neonAuthClient";
import {
  NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC,
  isEmailNotConfirmedAuthError,
  resendSignupVerificationEmail,
  verifySignupEmailOtp,
} from "../lib/neonEmailVerification";
import { exchangeNeonForStratum } from "../lib/neonStratumBridge";
import CookieConsent from "../components/CookieConsent";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";

const panelVariants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const leftPanelVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Login() {
  const { loginWithToken, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ email: null, password: null });
  /** Password sign-in succeeded at Neon but email not verified yet — offer OTP + resend */
  const [emailVerifyGate, setEmailVerifyGate] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  /** Neon does not send a code on failed sign-in alone — we trigger sendVerificationEmail when the OTP gate opens */
  const [verifyEmailSendBusy, setVerifyEmailSendBusy] = useState(false);

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

  const runFieldValidation = useCallback(() => {
    const ee = validateEmail(email);
    const pe = !password ? "Password is required." : null;
    setFieldErrors({ email: ee, password: pe });
    return !ee && !pe;
  }, [email, password]);

  useEffect(() => {
    if (!user) return;
    navigate("/portal/knowledge", { replace: true });
  }, [user, navigate]);

  if (user) {
    return null;
  }

  const handleGoogle = async () => {
    setError(null);
    if (!isNeonAuthConfigured || !neonAuth) {
      flashError("Set VITE_NEON_AUTH_URL in frontend/.env.local (Neon Console → Auth URL).");
      return;
    }
    setOauthBusy(true);
    try {
      const redirectTo = getOAuthRedirectTo();
      const { error: oErr } = await neonAuth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
          scopes: "email profile openid",
        },
      });
      if (oErr) flashError(oErr.message || "Could not start Google sign-in.");
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setOauthBusy(false);
    }
  };

  const handleNeonEmailSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    if (!isNeonAuthConfigured || !neonAuth) {
      flashError("Neon Auth is not configured.");
      return;
    }
    if (!runFieldValidation()) return;
    setLoading(true);
    try {
      const { data, error: neErr } = await neonAuth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (neErr) {
        if (isEmailNotConfirmedAuthError(neErr)) {
          setEmailVerifyGate(true);
          setOtpCode("");
          setError(null);
          const em = email.trim().toLowerCase();
          setVerifyEmailSendBusy(true);
          void (async () => {
            try {
              const { error: rErr } = await resendSignupVerificationEmail(neonAuth, em);
              if (rErr?.message) {
                flashError(
                  `Verify your email to continue. We could not send a code automatically: ${rErr.message} Use “Resend verification email” below.`
                );
              } else {
                setResendCooldownSec(NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC);
                notifySuccess("Verification code sent to your email.");
              }
            } catch (err) {
              flashError(parseApiError(err));
            } finally {
              setVerifyEmailSendBusy(false);
            }
          })();
          return;
        }
        flashError(neErr.message || "Sign-in failed.");
        return;
      }
      const access = data?.session?.access_token;
      if (!access) {
        flashError("No Neon session. Try again or use Google.");
        return;
      }
      await exchangeNeonForStratum(access, { loginWithToken, navigate, neonAuth });
    } catch (err) {
      flashError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const dismissEmailVerification = () => {
    setEmailVerifyGate(false);
    setOtpCode("");
    setError(null);
    setVerifyEmailSendBusy(false);
  };

  const handleVerifyEmailOtp = async (e) => {
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

  const handleResendVerificationFromLogin = async () => {
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

  if (!isNeonAuthConfigured || !neonAuth) {
    return (
      <>
        <Helmet>
          <title>{`Sign In — ${BRAND.name}`}</title>
        </Helmet>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
          <StratumMark variant="tile" size={40} decorative className="mb-4 opacity-90" />
          <p className="text-sm text-secondary text-center max-w-md mb-4">
            Sign-in uses Neon Auth only. Add{" "}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">VITE_NEON_AUTH_URL</code> to{" "}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">frontend/.env.local</code> and{" "}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">NEON_AUTH_URL</code> to{" "}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded">backend/.env</code> — the same Auth URL as
            Neon Console, then restart Vite and the API.
          </p>
          <CookieConsent />
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Sign In — ${BRAND.name}`}</title>
      </Helmet>

      <div className="min-h-screen flex bg-background">
        <motion.div
          className="hidden lg:flex lg:w-[42%] xl:w-[46%] flex-col relative overflow-hidden px-12 py-14 bg-gradient-to-br from-slate-950 via-[#0c1220] to-slate-900 text-white border-r border-white/[0.06]"
          variants={leftPanelVariants}
          initial="hidden"
          animate="visible"
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full bg-sky-500/25 blur-3xl" />
          <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative z-10 flex items-center gap-3 mb-auto">
            <StratumMark
              variant="inverse"
              size={44}
              decorative
              className="flex-shrink-0 drop-shadow-[0_0_28px_rgba(56,189,248,0.35)]"
            />
            <span className="font-display font-semibold text-sm tracking-wide text-slate-100">{BRAND.name}</span>
          </div>

          <div className="relative z-10 mt-16 mb-auto">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/90 mb-3">{BRAND.tagline}</p>
            <h1 className="text-4xl xl:text-5xl font-display font-bold leading-[1.15] text-white mb-5">
              {BRAND.heroLead},<br />
              <span className="text-sky-400">{BRAND.heroAccent}</span>
            </h1>
            <p className="text-base text-slate-300 leading-relaxed max-w-sm">{BRAND.heroBody}</p>
          </div>

          <div className="relative z-10 mt-10 space-y-3">
            {[
              "Hybrid RAG over internal documents",
              "Assistant with source citations",
              "Knowledge Hub (all) and Admin (stewards)",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>

          <p className="relative z-10 text-xs text-slate-500 mt-10">
            Internal use only · {BRAND.copyrightEntity} © {new Date().getFullYear()}
          </p>
        </motion.div>

        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <motion.div
            className="w-full max-w-sm"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="lg:hidden flex items-center gap-2.5 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/25">
                <StratumMark variant="knockout" size={24} decorative />
              </div>
              <span className="font-display font-semibold text-sm text-foreground">{BRAND.name}</span>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-1.5">Welcome back</h2>
            <p className="text-sm text-secondary mb-6">
              Sign in with <strong className="font-medium text-foreground/90">Google</strong> or your{" "}
              <strong className="font-medium text-foreground/90">Neon</strong> email and password. No separate app
              password.{" "}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                Create an account
              </Link>
            </p>

            <div className="mb-6">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={oauthBusy || loading}
                className="w-full py-2.5 px-3 text-sm font-semibold rounded-xl border border-border bg-surface hover:bg-surface-hover hover:border-primary/35 transition-all flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-60"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {oauthBusy ? "Redirecting…" : "Continue with Google"}
              </button>
            </div>

            <p className="text-xs text-secondary mb-6 flex items-center gap-2">
              <span className="flex-1 h-px bg-border" />
              or Neon email
              <span className="flex-1 h-px bg-border" />
            </p>

            {emailVerifyGate && (
              <div className="mb-5 space-y-4">
                <div
                  role="status"
                  className="px-3.5 py-3 rounded-xl bg-sky-50 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-800"
                >
                  <p className="text-xs text-sky-900 dark:text-sky-100 leading-relaxed">
                    This account still needs email verification. We&apos;re sending a 6-digit code to{" "}
                    <strong className="font-medium">{email.trim().toLowerCase()}</strong>
                    {verifyEmailSendBusy ? " (please wait…)" : ""}. Enter it below, or use Resend if it doesn&apos;t arrive.
                  </p>
                </div>
                <form onSubmit={handleVerifyEmailOtp} className="space-y-3">
                  <div>
                    <label htmlFor="login-otp" className="block text-xs font-medium text-foreground mb-1.5">
                      Verification code
                    </label>
                    <input
                      id="login-otp"
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
                    {otpLoading && <Loader2 size={15} className="portal-animate-spin" aria-hidden="true" />}
                    {otpLoading ? "Verifying…" : "Verify and continue"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendVerificationFromLogin}
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
                    onClick={dismissEmailVerification}
                    className="w-full py-2 text-xs text-secondary hover:text-foreground"
                  >
                    Back to password sign-in
                  </button>
                </form>
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
              >
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleNeonEmailSignIn} className={`space-y-4 ${emailVerifyGate ? "hidden" : ""}`}>
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailVerifyGate(false);
                    setOtpCode("");
                    setVerifyEmailSendBusy(false);
                    setFieldErrors((f) => ({ ...f, email: null }));
                  }}
                  onBlur={() => setFieldErrors((f) => ({ ...f, email: validateEmail(email) }))}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@company.com"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-surface text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all ${
                    fieldErrors.email ? "border-red-400 focus:border-red-500" : "border-border focus:border-primary"
                  }`}
                />
                {fieldErrors.email && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="login-password" className="block text-xs font-medium text-foreground">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-[11px] font-semibold text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((f) => ({ ...f, password: null }));
                    }}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border bg-surface text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all ${
                      fieldErrors.password ? "border-red-400 focus:border-red-500" : "border-border focus:border-primary"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || oauthBusy || emailVerifyGate || !email || !password}
                className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm shadow-primary/20"
              >
                {loading && <Loader2 size={15} className="portal-animate-spin" aria-hidden="true" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-7 text-center text-xs text-secondary/60">
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
            </p>
          </motion.div>
        </div>
      </div>

      <CookieConsent />
    </>
  );
}
