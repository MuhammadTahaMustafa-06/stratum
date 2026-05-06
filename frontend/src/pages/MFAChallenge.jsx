import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { mfaChallenge } from "../api/client";
import { parseApiError } from "../utils/apiError";
import { notifyError } from "../lib/notify";
import { ShieldCheck, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { BRAND } from "../lib/brand";
import StratumMark from "../components/brand/StratumMark";

const panelVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const CODE_LENGTH = 6;

export default function MFAChallenge() {
  const { loginWithToken, user } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  const inputRefs = useRef([]);

  useEffect(() => {
    if (user) navigate("/portal/knowledge", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const tempToken = sessionStorage.getItem("mfa_temp_token");

  const submit = async (codeStr) => {
    if (!tempToken) {
      const msg = "Session expired. Please sign in again.";
      setError(msg);
      notifyError(msg);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await mfaChallenge(tempToken, codeStr);
      sessionStorage.removeItem("mfa_temp_token");
      loginWithToken(result);
      navigate("/portal/knowledge", { replace: true });
    } catch (err) {
      const msg = parseApiError(err) || "Invalid code. Please try again.";
      setError(msg);
      notifyError(msg);
      setCode(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError(null);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === CODE_LENGTH - 1) {
      const full = [...next].join("");
      if (full.length === CODE_LENGTH) {
        submit(full);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (code[index]) {
        const next = [...code];
        next[index] = "";
        setCode(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === CODE_LENGTH) {
      submit(pasted);
    }
  };

  const handleBackupSubmit = (e) => {
    e.preventDefault();
    if (backupCode.trim()) submit(backupCode.trim());
  };

  return (
    <>
      <Helmet>
        <title>{`Two-Factor Authentication — ${BRAND.name}`}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
        <motion.div
          className="w-full max-w-sm"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/20">
              <StratumMark variant="knockout" size={22} decorative />
            </div>
            <span className="font-display font-semibold text-sm text-foreground">{BRAND.name}</span>
          </div>

          {/* Header */}
          <div className="flex items-start gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Two-Factor Authentication</h1>
              <p className="text-sm text-secondary mt-0.5">
                {useBackup
                  ? "Enter one of your backup codes to access your account."
                  : "Enter the 6-digit code from your authenticator app."}
              </p>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                aria-live="polite"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
              >
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {!useBackup ? (
              <motion.div
                key="totp"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* 6-digit OTP boxes */}
                <div
                  className="flex gap-2 justify-center mb-6"
                  role="group"
                  aria-label="6-digit verification code"
                >
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      aria-label={`Digit ${i + 1}`}
                      disabled={loading}
                      className="w-11 h-14 text-center text-xl font-bold rounded-xl border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50 caret-transparent"
                    />
                  ))}
                </div>

                {loading && (
                  <div role="status" aria-label="Verifying code" className="flex justify-center mb-4">
                    <Loader2 size={18} className="portal-animate-spin text-secondary" />
                  </div>
                )}

                <p className="text-center text-xs text-secondary/60 mb-6">
                  Code auto-submits when complete
                </p>

                <button
                  type="button"
                  onClick={() => { setUseBackup(true); setError(null); }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary hover:text-foreground transition-colors py-2"
                >
                  <KeyRound size={13} />
                  Use a backup code instead
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="backup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <form onSubmit={handleBackupSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="backup-code" className="block text-xs font-medium text-foreground mb-1.5">
                      Backup code
                    </label>
                    <input
                      id="backup-code"
                      type="text"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value)}
                      placeholder="e.g. ABCD-1234-EFGH"
                      autoFocus
                      autoComplete="one-time-code"
                      disabled={loading}
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-border bg-surface text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !backupCode.trim()}
                    className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 size={15} className="portal-animate-spin" aria-hidden="true" />}
                    Verify backup code
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => { setUseBackup(false); setError(null); setBackupCode(""); }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-secondary hover:text-foreground transition-colors py-3 mt-2"
                >
                  <ShieldCheck size={13} />
                  Use authenticator app instead
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 pt-6 border-t border-border">
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-xs text-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  );
}
