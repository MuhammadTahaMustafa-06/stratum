/** OAuth return URL for Neon Auth social login — must match Console allowed origins + path. */
export function getOAuthRedirectTo() {
  const fixed = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (fixed) return fixed;
  return `${window.location.origin}/auth/callback`;
}

/** Where Better Auth sends the user after clicking the email reset link (`?token=` or `?error=`). */
export function getPasswordResetRedirectTo() {
  const fixed = import.meta.env.VITE_AUTH_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (fixed) return fixed;
  return `${window.location.origin}/reset-password`;
}
