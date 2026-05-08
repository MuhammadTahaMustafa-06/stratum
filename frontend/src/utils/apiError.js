import { USER_MESSAGES } from "../lib/userMessages";

function isNetworkError(err) {
  const maybeNetworkCode = err?.code;
  const maybeMessage = String(err?.message || "");

  return (
    !err?.response &&
    (
      maybeNetworkCode === "ERR_NETWORK" ||
      maybeNetworkCode === "ECONNABORTED" ||
      maybeMessage === "Network Error" ||
      maybeMessage.includes("Failed to fetch")
    )
  );
}

function isServiceUnavailableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function sanitizeUserMessage(message, fallback = USER_MESSAGES.unexpected) {
  const value = String(message || "").trim();
  if (!value) return fallback;

  // Never show deployment/env instructions to end users.
  if (
    /NEON_AUTH_URL|VITE_|frontend\/\.env|backend\/\.env|Neon Console|Auth URL/i.test(value)
  ) {
    return USER_MESSAGES.signInUnavailable;
  }

  return value;
}

export function getApiErrorKind(err) {
  if (isNetworkError(err)) return "network";
  if (isServiceUnavailableStatus(err?.response?.status)) return "service";
  const code = err?.response?.data?.detail?.code || err?.response?.data?.error?.code;
  if (code === "NEON_AUTH_DISABLED") return "auth-config";
  return "api";
}

export function parseApiError(err, fallback = USER_MESSAGES.unexpected) {
  const status = err?.response?.status;

  if (isNetworkError(err)) return USER_MESSAGES.networkUnavailable;

  const data = err?.response?.data;

  // Gateway/service outage — keep this generic for user-facing surfaces.
  if (isServiceUnavailableStatus(status)) {
    if (data?.detail?.code === "NEON_AUTH_DISABLED") return USER_MESSAGES.signInUnavailable;
    if (data?.detail && typeof data.detail.message === "string" && data.detail.message.trim()) {
      return sanitizeUserMessage(data.detail.message, USER_MESSAGES.serviceUnavailable);
    }
    return USER_MESSAGES.serviceUnavailable;
  }

  if (!data) return sanitizeUserMessage(err?.message, fallback);

  // FastAPI structured error: { error: { message: "...", fields: [...] } }
  if (Array.isArray(data.error?.fields) && data.error.fields.length) {
    const parts = data.error.fields.map((f) => `${f.field}: ${f.message}`);
    return sanitizeUserMessage([data.error.message, ...parts].filter(Boolean).join(" "), fallback);
  }
  if (data.error?.message) {
    const hint = data.error.detail ? ` ${data.error.detail}` : "";
    return sanitizeUserMessage(`${data.error.message}${hint}`, fallback);
  }

  // FastAPI detail as string
  if (typeof data.detail === "string") return sanitizeUserMessage(data.detail, fallback);

  // FastAPI detail as object
  if (data.detail?.message) return sanitizeUserMessage(data.detail.message, fallback);

  // Pydantic validation errors
  if (Array.isArray(data.detail)) {
    return sanitizeUserMessage(data.detail.map((e) => e.msg || e.message || JSON.stringify(e)).join(", "), fallback);
  }

  return fallback;
}
