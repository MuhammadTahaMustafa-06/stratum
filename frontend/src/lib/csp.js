/**
 * Content-Security-Policy for the SPA (Helmet meta http-equiv).
 * Tuned for Vite dev (HMR) vs production build + API + Google Fonts (Syne).
 */
export function buildPortalCsp() {
  let apiOrigin = "http://127.0.0.1:8000";
  try {
    const base = import.meta.env.VITE_API_BASE || "/api/v1";
    apiOrigin = new URL(base, typeof window !== "undefined" ? window.location.origin : undefined).origin;
  } catch {
    /* keep default */
  }

  const isDev = Boolean(import.meta.env.DEV);
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";
  const connectExtra =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin} ws: wss:`
      : "ws: wss:";

  const connectSrcParts = ["'self'", apiOrigin, connectExtra];
  const googleOAuth = "https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com";
  try {
    const na = import.meta.env.VITE_NEON_AUTH_URL?.trim();
    if (na) {
      const o = new URL(na).origin;
      connectSrcParts.push(o);
      if (o.startsWith("https://")) connectSrcParts.push(o.replace("https://", "wss://"));
    }
  } catch {
    /* ignore */
  }
  connectSrcParts.push(googleOAuth);

  const formActionParts = ["'self'", "https://accounts.google.com"];
  try {
    const na = import.meta.env.VITE_NEON_AUTH_URL?.trim();
    if (na) formActionParts.push(new URL(na).origin);
  } catch {
    /* ignore */
  }

  // VITE_API_BASE=/api/v1 → apiOrigin is the SPA origin; loopback avatar URLs still need explicit hosts.
  const devLoopbackImgs =
    isDev && typeof window !== "undefined" && apiOrigin === window.location?.origin
      ? " http://127.0.0.1:8000 http://localhost:8000"
      : "";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // Proxied /uploads uses 'self'; absolute backend URLs in dev need loopback hosts when apiOrigin is the SPA.
    `img-src 'self' data: blob: https: ${apiOrigin}${devLoopbackImgs}`,
    `connect-src ${connectSrcParts.join(" ")}`,
    `frame-src 'self' blob: ${apiOrigin} https://accounts.google.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formActionParts.join(" ")}`,
    // frame-ancestors is not applied from <meta> (browser spec) — use X-Frame-Options / CSP on the
    // server (see frontend/nginx.conf) for clickjacking protection in production.
  ];

  if (!isDev && typeof window !== "undefined" && window.location?.protocol === "https:") {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
