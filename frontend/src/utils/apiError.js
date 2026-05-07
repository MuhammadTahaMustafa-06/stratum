export function parseApiError(err) {
  const maybeNetworkCode = err?.code;
  const maybeMessage = String(err?.message || "");
  const status = err?.response?.status;

  // Backend unreachable / dev server not started / CORS-preflight blocked.
  if (
    !err?.response &&
    (
      maybeNetworkCode === "ERR_NETWORK" ||
      maybeNetworkCode === "ECONNABORTED" ||
      maybeMessage === "Network Error" ||
      maybeMessage.includes("Failed to fetch")
    )
  ) {
    return "Backend server is not up yet. Start the API and try again.";
  }

  const data = err?.response?.data;

  // Gateway/service outage — still prefer FastAPI body when present (e.g. NEON_AUTH_DISABLED, DB errors).
  if (status === 502 || status === 503 || status === 504) {
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail.trim();
    if (data?.detail && typeof data.detail.message === "string" && data.detail.message.trim()) {
      return data.detail.message.trim();
    }
    return "Backend service is temporarily unavailable. Please try again in a moment.";
  }

  if (!data) return err?.message || "An unexpected error occurred.";

  // FastAPI structured error: { error: { message: "...", fields: [...] } }
  if (Array.isArray(data.error?.fields) && data.error.fields.length) {
    const parts = data.error.fields.map((f) => `${f.field}: ${f.message}`);
    return [data.error.message, ...parts].filter(Boolean).join(" ");
  }
  if (data.error?.message) {
    const hint = data.error.detail ? ` ${data.error.detail}` : "";
    return `${data.error.message}${hint}`.trim();
  }

  // FastAPI detail as string
  if (typeof data.detail === "string") return data.detail;

  // FastAPI detail as object
  if (data.detail?.message) return data.detail.message;

  // Pydantic validation errors
  if (Array.isArray(data.detail)) {
    return data.detail.map((e) => e.msg || e.message || JSON.stringify(e)).join(", ");
  }

  return "Something went wrong. Please try again.";
}
