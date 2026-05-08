import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { setupMFA, confirmMFA } from "../api/client";
import { X, ShieldCheck, Copy, Check, Loader2, KeyRound, Eye, EyeOff } from "lucide-react";

const CODE_LENGTH = 6;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};
const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } },
};

function useFocusTrap(ref, isOpen) {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    el.addEventListener("keydown", handleTab);
    first?.focus();
    return () => el.removeEventListener("keydown", handleTab);
  }, [isOpen, ref]);
}

function StepSetup({ onNext, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setupMFA()
      .then(setData)
      .catch((err) => {
        const msg = err?.response?.data?.detail || "Failed to initialise MFA setup. Try again.";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  const copySecret = async () => {
    if (!data?.secret) return;
    await navigator.clipboard.writeText(data.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 size={22} className="portal-animate-spin text-secondary/50" aria-hidden="true" />
      <p className="text-xs text-secondary" role="status">Setting up authenticator…</p>
    </div>
  );

  if (error) return (
    <div className="py-12 text-center px-4">
      <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">{error}</p>
      <button onClick={onClose} className="text-xs text-secondary hover:text-foreground transition-colors">
        Close
      </button>
    </div>
  );

  return (
    <div className="p-5 space-y-5">
      <div className="text-center">
        <p className="text-sm text-secondary leading-relaxed">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
        </p>
      </div>

      {/* QR code */}
      {data?.qr_code_base64 && (
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-xl border border-border inline-block">
            <img
              src={`data:image/png;base64,${data.qr_code_base64}`}
              alt="QR code for authenticator app setup"
              width={180}
              height={180}
              className="block"
            />
          </div>
        </div>
      )}

      {/* Manual entry */}
      <div>
        <p className="text-xs text-secondary mb-1.5">Or enter the secret key manually:</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <input
              type={showSecret ? "text" : "password"}
              value={data?.secret || ""}
              readOnly
              aria-label="TOTP secret key"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground focus:outline-none pr-8"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? "Hide secret key" : "Show secret key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
            >
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            type="button"
            onClick={copySecret}
            aria-label="Copy secret key"
            className="p-2 rounded-lg border border-border bg-background text-secondary hover:text-foreground hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 transition-all"
      >
        I've scanned the code — Next
      </button>
    </div>
  );
}

function StepVerify({ onSuccess, onClose }) {
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const submit = async (codeStr) => {
    setError(null);
    setLoading(true);
    try {
      const result = await confirmMFA(codeStr);
      onSuccess(result?.backup_codes || []);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Invalid code. Check your authenticator app and try again.";
      setError(msg);
      setCode(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (index, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setError(null);
    if (digit && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (digit && index === CODE_LENGTH - 1) {
      const full = next.join("");
      if (full.length === CODE_LENGTH) submit(full);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (code[index]) { const n = [...code]; n[index] = ""; setCode(n); }
      else if (index > 0) inputRefs.current[index - 1]?.focus();
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
    if (pasted.length === CODE_LENGTH) submit(pasted);
  };

  return (
    <div className="p-5 space-y-5">
      <p className="text-sm text-secondary text-center leading-relaxed">
        Enter the 6-digit code shown in your authenticator app to verify setup.
      </p>

      <AnimatePresence>
        {error && (
          <motion.div
            role="alert"
            aria-live="polite"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
          >
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-1.5 justify-center sm:gap-2" role="group" aria-label="6-digit verification code">
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            aria-label={`Digit ${i + 1}`}
            disabled={loading}
            className="w-9 h-12 text-center text-lg font-bold rounded-xl border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50 caret-transparent sm:w-11 sm:h-14 sm:text-xl"
          />
        ))}
      </div>

      {loading && (
        <div role="status" aria-label="Verifying code" className="flex justify-center">
          <Loader2 size={18} className="portal-animate-spin text-secondary" />
        </div>
      )}
    </div>
  );
}

function StepBackupCodes({ codes, onClose }) {
  const [copiedAll, setCopiedAll] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
        <KeyRound size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <strong>Save these backup codes now.</strong> They will not be shown again. Each code can only be used once to access your account if you lose your authenticator app.
        </p>
      </div>

      {codes.length > 0 ? (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {codes.map((c, i) => (
              <code key={i} className="block rounded-lg border border-border bg-surface px-2 py-1.5 text-center font-mono text-xs text-foreground break-all">
                {c}
              </code>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-secondary text-center py-4">No backup codes returned by server.</p>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        {codes.length > 0 && (
          <button
            type="button"
            onClick={copyAll}
            aria-label="Copy all backup codes"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium rounded-xl border border-border hover:bg-surface-hover transition-colors"
          >
            {copiedAll ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            {copiedAll ? "Copied!" : "Copy all"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
}

const STEPS = ["setup", "verify", "backup"];

/**
 * MFASetup — modal for enabling TOTP MFA from a user's profile/settings.
 * Props:
 *   onClose  — called when modal should close
 */
export default function MFASetup({ onClose }) {
  const [step, setStep] = useState("setup");
  const [backupCodes, setBackupCodes] = useState([]);
  const modalRef = useRef(null);
  useFocusTrap(modalRef, true);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const stepIndex = STEPS.indexOf(step);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-stretch justify-center z-50 p-2 sm:items-center sm:p-4"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label="Multi-factor authentication setup"
      >
        <motion.div
          ref={modalRef}
          className="bg-surface rounded-2xl border border-border w-full max-w-md max-h-[calc(100dvh-1rem)] shadow-2xl overflow-y-auto sm:max-h-[90vh]"
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground leading-snug">Set Up Two-Factor Authentication</h2>
                <p className="text-xs text-secondary mt-0.5">
                  Step {stepIndex + 1} of {STEPS.length}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close MFA setup"
              className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              role="progressbar"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label="Setup progress"
            />
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            {step === "setup" && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <StepSetup onNext={() => setStep("verify")} onClose={onClose} />
              </motion.div>
            )}
            {step === "verify" && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <StepVerify onSuccess={(codes) => { setBackupCodes(codes); setStep("backup"); }} onClose={onClose} />
              </motion.div>
            )}
            {step === "backup" && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <StepBackupCodes codes={backupCodes} onClose={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
