/** Neon Auth email OTP (signup verification) — Supabase-compatible adapter surface. */

/** Seconds between “Resend verification email” clicks (Neon rate limits may still apply). */
export const NEON_EMAIL_VERIFY_RESEND_COOLDOWN_SEC = 60;

export function isEmailNotConfirmedAuthError(err) {
  if (!err || typeof err !== "object") return false;
  const code = String(err.code ?? "")
    .toLowerCase()
    .replace(/-/g, "_");
  if (code === "email_not_confirmed") return true;
  if (code === "email_not_verified") return true;
  const msg = String(err.message ?? "").toLowerCase();
  if (/email\s*(address\s*)?(is\s*)?not\s*verified/.test(msg)) return true;
  if (/verification\s*required/.test(msg) && /email/.test(msg)) return true;
  /** Some Neon / Better Auth deployments return 403 until email is verified */
  const status = err.status ?? err.statusCode;
  if (status === 403 && /verify|verif|unconfirmed|not\s*verified/.test(msg)) return true;
  return false;
}

export function isExpiredOtpError(errOrMessage) {
  const code = String(
    typeof errOrMessage === "string" ? "" : errOrMessage?.code ?? ""
  )
    .toLowerCase()
    .replace(/-/g, "_");
  if (code.includes("expired")) return true;
  const msg = String(
    typeof errOrMessage === "string"
      ? errOrMessage
      : errOrMessage?.message ?? errOrMessage?.msg ?? ""
  ).toLowerCase();
  return /expired|code\s*(has\s*)?expired|otp\s*(has\s*)?expired|token\s*(has\s*)?expired/.test(msg);
}

/**
 * Resend signup verification email (contains 6-digit OTP). Maps to Better Auth `sendVerificationEmail`.
 */
export async function resendSignupVerificationEmail(neonAuth, email) {
  if (!neonAuth || typeof neonAuth.resend !== "function") {
    return {
      data: null,
      error: { message: "Resend is not available in this client." },
    };
  }
  const origin = typeof globalThis.window !== "undefined" ? globalThis.window.location.origin : "";
  return neonAuth.resend({
    email: email.trim().toLowerCase(),
    type: "signup",
    options: { emailRedirectTo: origin },
  });
}

export async function verifySignupEmailOtp(neonAuth, email, rawCode) {
  const token = String(rawCode ?? "").replace(/\D/g, "").slice(0, 6);
  if (token.length !== 6) {
    return {
      accessToken: null,
      error: "Enter the 6-digit code from your Neon verification email.",
    };
  }
  if (typeof neonAuth?.verifyOtp !== "function") {
    return {
      accessToken: null,
      error: "Email code verification is not available in this client. Update @neondatabase/auth or sign in after verifying.",
    };
  }
  const { data, error } = await neonAuth.verifyOtp({
    email: email.trim().toLowerCase(),
    token,
    type: "signup",
  });
  if (error) {
    if (isExpiredOtpError(error)) {
      return {
        accessToken: null,
        error: "That verification code has expired. Request a new code and try again.",
      };
    }
    return {
      accessToken: null,
      error: error.message || "Invalid or expired code. Request a new email or try again.",
    };
  }
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    return {
      accessToken: null,
      error: "Email verified but no session yet. Wait a moment and use Sign in, or contact support if this persists.",
    };
  }
  return { accessToken, error: null };
}
