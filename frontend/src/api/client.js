import axios from "axios";
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  persistSession,
  clearStoredSession,
  canRefreshSession,
} from "../lib/authTokens";
import { authRefreshUsesCookie } from "../lib/authConfig";
import { emitAuthExpired, emitAuthRefreshed } from "../lib/authEvents";

/** Default `/api/v1` matches Vite proxy + Docker nginx; override with `VITE_API_BASE` if needed. */
const BASE_URL =
  (import.meta.env.VITE_API_BASE && String(import.meta.env.VITE_API_BASE).trim()) || "/api/v1";

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: authRefreshUsesCookie,
});

/** Do not attach refresh-retry to these paths — avoids loops */
function shouldSkipRefreshOn401(config) {
  const u = config?.url || "";
  return (
    u.includes("/auth/refresh") ||
    u.includes("/auth/login") ||
    u.includes("/auth/logout") ||
    u.includes("/auth/neon/exchange") ||
    u.includes("/auth/mfa/verify-login")
  );
}

client.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** One in-flight POST /auth/refresh for the whole app (proactive + 401 recovery). */
let _refreshInFlight = null;

/**
 * Rotate Stratum tokens using the stored refresh token.
 * Concurrent callers share the same request so only one rotation runs at a time.
 */
export function refreshStratumSession() {
  if (_refreshInFlight) return _refreshInFlight;

  if (!authRefreshUsesCookie) {
    const rt = getStoredRefreshToken();
    if (!rt) {
      clearStoredSession();
      emitAuthExpired();
      return Promise.reject(new Error("NO_REFRESH_TOKEN"));
    }
  }

  _refreshInFlight = axios
    .post(
      `${BASE_URL}/auth/refresh`,
      authRefreshUsesCookie ? {} : { refresh_token: getStoredRefreshToken() },
      { withCredentials: authRefreshUsesCookie }
    )
    .then(({ data }) => {
      persistSession(data);
      emitAuthRefreshed({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      });
      return data;
    })
    .catch((e) => {
      clearStoredSession();
      emitAuthExpired();
      throw e;
    })
    .finally(() => {
      _refreshInFlight = null;
    });

  return _refreshInFlight;
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (!original || err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    if (shouldSkipRefreshOn401(original)) {
      return Promise.reject(err);
    }

    if (!canRefreshSession()) {
      clearStoredSession();
      emitAuthExpired();
      return Promise.reject(err);
    }

    original._retry = true;
    try {
      const data = await refreshStratumSession();
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return client(original);
    } catch {
      return Promise.reject(err);
    }
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

/** Exchange Neon Auth access JWT for Stratum tokens (no Bearer header). */
export const exchangeNeonToken = (access_token) =>
  axios.post(`${BASE_URL}/auth/neon/exchange`, { access_token }, { withCredentials: authRefreshUsesCookie }).then(
    (r) => r.data
  );

export const getMe = () => client.get("/auth/me").then((r) => r.data);
export const updateMe = (payload) => client.put("/auth/me", payload).then((r) => r.data);
export const uploadMyAvatar = (file) => {
  const body = new FormData();
  body.append("file", file);
  return client.post("/auth/me/avatar", body).then((r) => r.data);
};

/** @deprecated Use refreshStratumSession — kept for call sites that passed refresh_token (ignored; storage is source of truth). */
export const refreshAccessToken = (_refresh_token) => refreshStratumSession();

export const logoutApi = () =>
  client
    .post("/auth/logout", authRefreshUsesCookie ? {} : { refresh_token: getStoredRefreshToken() || "" })
    .then((r) => r.data);

export const changePassword = (current_password, new_password) =>
  client.post("/auth/change-password", { current_password, new_password }).then((r) => r.data);

// ── MFA ───────────────────────────────────────────────────────────────────────
export const setupMFA = () => client.post("/auth/mfa/setup").then((r) => r.data);

export const confirmMFA = (code) => client.post("/auth/mfa/confirm", { code }).then((r) => r.data);

export const verifyMfaLogin = (mfa_token, code) =>
  client.post("/auth/mfa/verify-login", { mfa_token, code }).then((r) => r.data);

// Alias used by Login.jsx MFA challenge step
export const mfaChallenge = (mfa_token, code) => verifyMfaLogin(mfa_token, code);

export const disableMFA = (password) =>
  client.post("/auth/mfa/disable", { password }).then((r) => r.data);

// ── Chat & Search ─────────────────────────────────────────────────────────────
export const chat = (query, history = [], domain = null) =>
  client.post("/chat", { query, history, domain }).then((r) => r.data);

function shouldOpenPdfInSameTab() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(max-width: 768px), (pointer: coarse)")?.matches;
}

export function openBlobUrlInBrowser(url) {
  if (shouldOpenPdfInSameTab()) {
    window.location.assign(url);
    return;
  }

  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) window.location.assign(url);
}

/**
 * Open a PDF from data/raw (same files RAG indexes). Uses the authenticated API client
 * so the Bearer token is sent (a plain anchor URL would not).
 */
export async function openRawKnowledgePdf(fileName) {
  const name = (fileName || "").trim();
  if (!name.toLowerCase().endsWith(".pdf")) return;
  const qs = new URLSearchParams({ file: name });
  const res = await client.get(`/knowledge/raw-pdf?${qs}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  openBlobUrlInBrowser(url);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export const ask = (query, intent = "general", filters = {}, history = []) =>
  client.post("/ask", { query, intent, filters, history }).then((r) => r.data);

export const search = (query, filters = {}, topK = 10, domain = null) =>
  client.post("/search", { query, filters, top_k: topK, domain }).then((r) => r.data);

export const submitFeedback = (query, answer, rating, comment = "", sources = []) =>
  client.post("/feedback", { query, answer, rating, comment, sources }).then((r) => r.data);

// ── Articles ──────────────────────────────────────────────────────────────────
export const listArticles = (params = {}) => client.get("/articles", { params }).then((r) => r.data);

export const getArticle = (id) => client.get(`/articles/${id}`).then((r) => r.data);

export const createArticle = (data) => client.post("/articles", data).then((r) => r.data);

export const updateArticle = (id, data) => client.put(`/articles/${id}`, data).then((r) => r.data);

export const deleteArticle = (id) =>
  client.delete(`/articles/${encodeURIComponent(id)}`).then((r) => r.data);

export const submitReview = (id, comment = "") =>
  client.post(`/articles/${id}/submit-review`, { comment }).then((r) => r.data);

export const approveArticle = (id, comment = "") =>
  client.post(`/articles/${id}/approve`, { comment }).then((r) => r.data);

export const archiveArticle = (id, comment = "") =>
  client.post(`/articles/${id}/archive`, { comment }).then((r) => r.data);

export const unarchiveArticle = (id, comment = "") =>
  client.post(`/articles/${id}/unarchive`, { comment }).then((r) => r.data);

// ── Bookmarks ─────────────────────────────────────────────────────────────────
export const listBookmarks = () => client.get("/bookmarks").then((r) => r.data);

export const addBookmark = (articleId) =>
  client.post("/bookmarks", { article_id: articleId }).then((r) => r.data);

export const removeBookmark = (articleId) =>
  client.delete(`/bookmarks/${encodeURIComponent(articleId)}`);

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAdminSources = () => client.get("/admin/sources").then((r) => r.data);
export const deleteRawSource = (filename) => client.delete(`/admin/sources/raw/${encodeURIComponent(filename)}`).then((r) => r.data);
export const deleteUser = (userId) => client.delete(`/admin/users/${userId}`);

export const triggerReindex = (force = false) =>
  client.post("/admin/reindex", { force }).then((r) => r.data);

/** Upload a PDF to the raw ingest folder (Content Manager / Platform Admin). */
export const uploadPdf = (file) => {
  const body = new FormData();
  body.append("file", file);
  return client.post("/admin/upload-pdf", body).then((r) => r.data);
};

export const listUsers = () => client.get("/admin/users").then((r) => r.data);

export const createUser = (data) => client.post("/admin/users", data).then((r) => r.data);

/** Admin: toggle is_active or change role. Pass only the fields to change. */
export const updateUser = (userId, patch) =>
  client.patch(`/admin/users/${userId}`, patch).then((r) => r.data);

export const getAnalytics = () => client.get("/analytics/summary").then((r) => r.data);

/** Platform admin: paginated RAG/chat query logs (`query_logs`). */
export const listAdminQueryLogs = (params = {}) =>
  client.get("/admin/query-logs", { params }).then((r) => r.data);

/** Platform admin: article version history (content audit trail). */
export const listAdminAuditEvents = (params = {}) =>
  client.get("/admin/audit-events", { params }).then((r) => r.data);

/** Platform admin: user feedback (chatbot ratings). */
export const listAdminFeedback = (params = {}) =>
  client.get("/admin/feedback", { params }).then((r) => r.data);

/** Platform admin: paginated top unanswered queries. */
export const listKnowledgeGaps = (params = {}) =>
  client.get("/admin/knowledge-gaps", { params }).then((r) => r.data);

export default client;
