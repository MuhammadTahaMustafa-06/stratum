/** Shared client-side validation (mirrors key API rules; keep messages user-facing). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "Email is required.";
  if (v.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
  return null;
}

export function validateLoginPassword(value) {
  const v = value || "";
  if (!v) return "Password is required.";
  if (v.length > 256) return "Password is too long.";
  return null;
}

/** Mirrors backend UserCreateRequest password rules. */
export function validateNewUserPassword(value) {
  const v = value || "";
  if (!v) return "Password is required.";
  if (v.length < 8) return "Password must be at least 8 characters.";
  if (v.length > 256) return "Password is too long.";
  if (!/[A-Z]/.test(v)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(v)) return "Password must contain at least one lowercase letter.";
  if (!/\d/.test(v)) return "Password must contain at least one digit.";
  return null;
}

export function validateMfaCode(value) {
  const s = String(value || "").replace(/\D/g, "");
  if (s.length !== 6) return "Enter the 6-digit code.";
  return null;
}

export function validateArticleDraft({ title, content, summary }) {
  const errs = {};
  const t = (title || "").trim();
  const c = content || "";
  const sum = summary || "";
  if (!t) errs.title = "Title is required.";
  else if (t.length > 300) errs.title = "Title must be 300 characters or less.";
  if (!c.trim()) errs.content = "Content is required.";
  else if (c.length > 500000) errs.content = "Content is too long.";
  if (sum.length > 2000) errs.summary = "Summary must be 2000 characters or less.";
  return Object.keys(errs).length ? errs : null;
}
