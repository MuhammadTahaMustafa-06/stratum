import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  getAnalytics, getAdminSources, listAdminQueryLogs, listAdminAuditEvents, triggerReindex, deleteRawSource,
  listArticles, createArticle, updateArticle, deleteArticle, approveArticle, archiveArticle, unarchiveArticle, submitReview,
  listUsers, createUser, updateUser, deleteUser,
} from "../api/client";
import {
  FileText, RefreshCw, Plus, Loader2, TrendingDown,
  AlertCircle, CheckCircle, X, Database, BarChart3, BookMarked, Users,
  ShieldCheck, UserCog, PowerOff, Power, ChevronDown, CheckCircle2,
  Trash2, ExternalLink, RotateCcw, ScrollText, History, Search, Pencil, FileText as FileIcon, LayoutDashboard
} from "lucide-react";
import { BRAND } from "../lib/brand";
import { validateArticleDraft, validateEmail, validateNewUserPassword } from "../lib/validation";
import { useAuth } from "../context/AuthContext";
import { isSystemAdmin, ROLE_LABELS } from "../lib/roles";
import { parseApiError } from "../utils/apiError";
import { notifyApiError, notifySuccess } from "../lib/notify";
import { PageSpinner } from "../components/ui/Skeleton";
import { PaginationBar } from "../components/ui/PaginationBar";

const ADMIN_ARTICLES_PAGE_SIZE = 15;
const RAW_FILES_PAGE_SIZE = 10;
const ADMIN_LOGS_PAGE_SIZE = 25;
const ADMIN_AUDIT_PAGE_SIZE = 25;

function formatAdminTs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function clipText(s, max = 160) {
  if (s == null || s === "") return "—";
  const t = String(s);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** Admin API `reconciliation[].situation` → short label for filters and badges */
const RECON_SITUATION_META = {
  in_sync: { label: "In sync", hint: "Raw file, indexed, and portal article linked." },
  rag_only: { label: "RAG only", hint: "Indexed but no KB article with matching system_name (.pdf)." },
  portal_not_indexed: { label: "Portal, not indexed", hint: "Article points at this PDF but no chunks in the vector index yet." },
  raw_only: { label: "Raw only", hint: "PDF on disk but not in Chroma yet (re-ingest / re-index)." },
  orphan_article: { label: "Orphan article", hint: "Article links to this filename but file is missing and not indexed." },
  portal_indexed_missing_raw: { label: "Indexed, raw missing", hint: "Portal + index reference this name but the raw file is gone from data/raw." },
  vectors_missing_raw: { label: "Vectors, raw missing", hint: "Chunks exist; raw file absent (often after delete)." },
  registry_only: { label: "Registry only", hint: "Listed in ingest hash registry but not raw and not indexed — often a removed PDF." },
};

const RECON_BADGE = {
  in_sync: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:border-emerald-900",
  rag_only: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/35 dark:text-sky-300 dark:border-sky-900",
  portal_not_indexed: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-900",
  raw_only: "bg-violet-50 text-violet-900 border-violet-200 dark:bg-violet-950/35 dark:text-violet-300 dark:border-violet-900",
  orphan_article: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/35 dark:text-red-300 dark:border-red-900",
  portal_indexed_missing_raw: "bg-orange-50 text-orange-900 border-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:border-orange-900",
  vectors_missing_raw: "bg-orange-50 text-orange-900 border-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:border-orange-900",
  registry_only: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-700",
};

const tabContentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const TABS = [
  { id: "Overview", label: "Overview", Icon: BarChart3 },
  { id: "Logs", label: "App logs", Icon: ScrollText },
  { id: "Audit", label: "Audit", Icon: History },
  { id: "Articles", label: "Articles", Icon: BookMarked },
  { id: "Users", label: "Users", Icon: Users },
];

const ROLE_SELECT_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_BADGE = {
  published: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900",
  draft: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700",
  in_review: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
  archived: "bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-900/20 dark:text-gray-600 dark:border-gray-800",
};

function StatCard({ label, value, tone, Icon }) {
  let toneCls = "text-foreground";
  if (tone === "success") toneCls = "text-green-600 dark:text-green-400";
  else if (tone === "warning") toneCls = "text-amber-600 dark:text-amber-400";

  return (
    <div className="p-5 rounded-2xl border border-border bg-surface flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/12 transition-colors">
          <Icon size={16} className="text-primary" />
        </div>
      )}
      <div>
        <p className={`text-3xl font-bold tracking-tight ${toneCls}`}>{value ?? "—"}</p>
        <p className="text-xs font-medium text-secondary mt-1">{label}</p>
      </div>
    </div>
  );
}

const DOMAIN_OPTS = [
  { value: "general", label: "General" },
  { value: "application", label: "Application" },
  { value: "banking", label: "Banking Domain" },
  { value: "process", label: "Process" },
  { value: "tribal", label: "Team Knowledge" },
];

const ARTICLE_MODAL_INITIAL = {
  title: "",
  content: "",
  summary: "",
  domain: "general",
  tags: "",
  system_name: "",
};

function basenameOnly(pathOrName) {
  const s = String(pathOrName || "").trim().replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function ArticleModal({ onClose, onCreate, rawFiles = [] }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({ ...ARTICLE_MODAL_INITIAL }));
  const [openAfterCreate, setOpenAfterCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFormErrors((er) => ({ ...er, [k]: undefined }));
  };

  const resetForm = () => {
    setForm({ ...ARTICLE_MODAL_INITIAL });
    setOpenAfterCreate(false);
    setFormErrors({});
  };

  const handleClearForm = () => {
    const dirty =
      form.title.trim() ||
      form.content.trim() ||
      form.summary.trim() ||
      form.tags.trim() ||
      form.system_name.trim();
    if (dirty && !window.confirm("Clear all fields? Unsaved text will be lost.")) return;
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const tagsList = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const draftErr = validateArticleDraft({
      title: form.title,
      content: form.content,
      summary: form.summary,
    });
    if (draftErr) {
      setFormErrors(draftErr);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const sn = form.system_name.trim();
      const payload = {
        title: form.title,
        content: form.content,
        summary: form.summary || undefined,
        domain: form.domain,
        tags: tagsList,
        ...(sn ? { system_name: basenameOnly(sn) } : {}),
      };
      const created = await onCreate(payload);
      if (openAfterCreate && created?.id) {
        navigate(`/portal/knowledge/articles/${created.id}`);
      }
      onClose();
    } catch {
      /* Parent surfaces toast + API message */
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">New Article</h2>
            <p className="text-xs text-secondary mt-0.5">Article will be saved as a draft</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Title <span className="text-red-500">*</span></label>
            <input required value={form.title} onChange={set("title")} placeholder="Article title" className={inputCls} aria-invalid={formErrors.title ? "true" : "false"} />
            {formErrors.title && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.title}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Domain</label>
            <select value={form.domain} onChange={set("domain")} className={inputCls}>
              {DOMAIN_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Linked PDF <span className="text-secondary font-normal">(optional)</span>
            </label>
            <input
              value={form.system_name}
              onChange={set("system_name")}
              list="admin-new-article-raw-pdfs"
              placeholder="Filename in data/raw, e.g. KM-01-Payments-SEPA-Overview.pdf"
              autoComplete="off"
              className={inputCls}
            />
            <datalist id="admin-new-article-raw-pdfs">
              {rawFiles.map((f) => (
                <option key={f.name} value={f.name} />
              ))}
            </datalist>
            <p className="text-[11px] text-secondary mt-1 leading-relaxed">
              Sets <code className="text-[10px]">system_name</code> so the article can open the raw PDF and appear in source reconciliation. Ingestion does not require this field.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Summary</label>
            <input value={form.summary} onChange={set("summary")} placeholder="Brief one-line summary shown in listings" className={inputCls} aria-invalid={formErrors.summary ? "true" : "false"} />
            {formErrors.summary && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.summary}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Tags <span className="text-secondary font-normal">(comma-separated)</span></label>
            <input value={form.tags} onChange={set("tags")} placeholder="e.g. payments, swift, sepa" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Content <span className="text-red-500">*</span></label>
            <textarea
              required value={form.content} onChange={set("content")}
              rows={9} placeholder="Markdown supported…"
              className={`${inputCls} resize-y font-mono text-xs`}
              aria-invalid={formErrors.content ? "true" : "false"}
            />
            {formErrors.content && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.content}</p>}
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border border-border/80 bg-background/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={openAfterCreate}
              onChange={(e) => setOpenAfterCreate(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary/30"
            />
            <span className="text-xs text-foreground leading-snug">
              <span className="font-semibold">Open in portal after create</span>
              <span className="text-secondary block mt-0.5">Navigate to the article page once the draft is saved.</span>
            </span>
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="sm:flex-1 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-surface-hover transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleClearForm}
              className="sm:flex-1 py-2.5 text-sm font-medium border border-border rounded-xl text-secondary hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/80 dark:hover:bg-amber-950/25 dark:hover:text-amber-400 dark:hover:border-amber-900 transition-colors inline-flex items-center justify-center gap-2">
              <RotateCcw size={14} /> Clear form
            </button>
            <button type="submit" disabled={saving}
              className="sm:flex-[1.2] py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="portal-animate-spin" /> : <Plus size={14} />} Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function articleToEditForm(a) {
  return {
    title: a.title || "",
    content: a.content || "",
    summary: a.summary || "",
    domain: a.domain || "general",
    tags: Array.isArray(a.tags) ? a.tags.join(", ") : "",
    system_name: a.system_name || "",
  };
}

function EditArticleModal({ article, rawFiles = [], onClose, onSaved }) {
  const [form, setForm] = useState(() => articleToEditForm(article));
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    setForm(articleToEditForm(article));
    setFormErrors({});
  }, [article?.id]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFormErrors((er) => ({ ...er, [k]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const tagsList = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const draftErr = validateArticleDraft({
      title: form.title,
      content: form.content,
      summary: form.summary,
    });
    if (draftErr) {
      setFormErrors(draftErr);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const sn = form.system_name.trim();
      const payload = {
        title: form.title,
        content: form.content,
        summary: form.summary.trim() ? form.summary.trim() : null,
        domain: form.domain,
        tags: tagsList,
        system_name: sn ? basenameOnly(sn) : null,
      };
      const updated = await updateArticle(article.id, payload);
      onSaved(updated);
    } catch (err) {
      notifyApiError(err, "Could not save article.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Edit article</h2>
            <p className="text-xs text-secondary mt-0.5 truncate" title={article.title}>{article.title}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              to={`/portal/knowledge/articles/${article.id}`}
              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
              title="Open in portal"
            >
              <ExternalLink size={16} />
            </Link>
            <button type="button" onClick={onClose} className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Title <span className="text-red-500">*</span></label>
            <input required value={form.title} onChange={set("title")} placeholder="Article title" className={inputCls} aria-invalid={formErrors.title ? "true" : "false"} />
            {formErrors.title && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.title}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Domain</label>
            <select value={form.domain} onChange={set("domain")} className={inputCls}>
              {DOMAIN_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Linked PDF <span className="text-secondary font-normal">(optional)</span>
            </label>
            <input
              value={form.system_name}
              onChange={set("system_name")}
              list="admin-edit-article-raw-pdfs"
              placeholder="Filename in data/raw — leave empty to remove link"
              autoComplete="off"
              className={inputCls}
            />
            <datalist id="admin-edit-article-raw-pdfs">
              {rawFiles.map((f) => (
                <option key={f.name} value={f.name} />
              ))}
            </datalist>
            <p className="text-[11px] text-secondary mt-1 leading-relaxed">
              Must match a file under <code className="text-[10px]">data/raw</code>. Empty field removes the PDF link.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Summary</label>
            <input value={form.summary} onChange={set("summary")} placeholder="Brief one-line summary shown in listings" className={inputCls} aria-invalid={formErrors.summary ? "true" : "false"} />
            {formErrors.summary && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.summary}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Tags <span className="text-secondary font-normal">(comma-separated)</span></label>
            <input value={form.tags} onChange={set("tags")} placeholder="e.g. payments, swift, sepa" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Content <span className="text-red-500">*</span></label>
            <textarea
              required value={form.content} onChange={set("content")}
              rows={9} placeholder="Markdown supported…"
              className={`${inputCls} resize-y font-mono text-xs`}
              aria-invalid={formErrors.content ? "true" : "false"}
            />
            {formErrors.content && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{formErrors.content}</p>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="sm:flex-1 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-surface-hover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="sm:flex-[1.2] py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="portal-animate-spin" /> : <Pencil size={14} />} Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "employee",
    team: "",
    department: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const inputCls = "w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all";
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailErr = validateEmail(form.email);
    const pwErr = validateNewUserPassword(form.password);
    const name = (form.full_name || "").trim();
    if (emailErr || pwErr || !name) {
      setFormError(emailErr || pwErr || "Full name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onCreated({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: name,
        role: form.role,
        team: form.team.trim() || null,
        department: form.department.trim() || null,
      });
      onClose();
    } catch (err) {
      setFormError(parseApiError(err));
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">New user</h2>
            <p className="text-xs text-secondary mt-0.5">Creates a local Stratum account (same rules as API)</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-1">
          {formError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 text-xs text-red-800 dark:text-red-200">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Email <span className="text-red-500">*</span></label>
            <input type="email" required value={form.email} onChange={set("email")} placeholder="name@company.com" className={inputCls} autoComplete="off" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Temporary password <span className="text-red-500">*</span></label>
            <input type="password" required value={form.password} onChange={set("password")} placeholder="8+ chars, upper, lower, digit" className={inputCls} autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Full name <span className="text-red-500">*</span></label>
            <input required value={form.full_name} onChange={set("full_name")} placeholder="Jane Doe" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Role</label>
            <select value={form.role} onChange={set("role")} className={inputCls}>
              {ROLE_SELECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Team</label>
              <input value={form.team} onChange={set("team")} placeholder="Optional" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Department</label>
              <input value={form.department} onChange={set("department")} placeholder="Optional" className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-surface-hover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="portal-animate-spin" /> : <Plus size={14} />} Create user
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Role badge helper ──────────────────────────────────────────────────────────
const ROLE_BADGE_CLS = {
  system_admin: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
  knowledge_admin: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800",
  domain_expert: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  employee: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700",
};

const ROLE_TEXT_CLS = {
  system_admin: "text-violet-600 dark:text-violet-400",
  knowledge_admin: "text-cyan-600 dark:text-cyan-400",
  domain_expert: "text-amber-600 dark:text-amber-400",
  employee: "text-slate-500 dark:text-slate-400",
};

// ── Inline role dropdown ───────────────────────────────────────────────────────
function RoleDropdown({ userId, currentRole, onChanged, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const changeRole = async (role) => {
    if (role === currentRole) { setOpen(false); return; }
    setBusy(true); setLocalError(""); setOpen(false);
    try {
      const updated = await updateUser(userId, { role });
      onChanged(updated);
    } catch (err) {
      setLocalError(parseApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((o) => !o)}
        title="Change role"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold
          ${ROLE_BADGE_CLS[currentRole] || ROLE_BADGE_CLS.employee}
          hover:ring-2 hover:ring-primary/25 transition-all disabled:opacity-50`}
      >
        {busy ? <Loader2 size={10} className="portal-animate-spin" /> : <ShieldCheck size={10} />}
        {ROLE_LABELS[currentRole] || currentRole}
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {localError && (
        <p className="absolute top-full mt-1 left-0 text-[10px] text-red-500 whitespace-nowrap z-20">{localError}</p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-2 left-0 z-50 w-48 rounded-xl border border-border bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden"
          >
            <div className="py-1.5">
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => changeRole(val)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-left
                    hover:bg-surface-hover transition-colors
                    ${val === currentRole ? "bg-primary/5 text-primary font-bold" : "text-foreground"}`}
                >
                  <div className="w-5 flex items-center justify-center flex-shrink-0">
                    {val === currentRole ? (
                      <CheckCircle2 size={13} className="text-primary" />
                    ) : (
                      <div className={`w-2 h-2 rounded-full opacity-60 ${ROLE_TEXT_CLS[val]?.split(" ")[0].replace("text-", "bg-") || "bg-slate-300"}`} />
                    )}
                  </div>
                  <span className={val === currentRole ? "text-primary" : ROLE_TEXT_CLS[val] || ""}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Toggle active button ───────────────────────────────────────────────────────
function ActiveToggle({ userId, isActive, onChanged, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true); setError("");
    try {
      const updated = await updateUser(userId, { is_active: !isActive });
      onChanged(updated);
    } catch (err) {
      setError(parseApiError(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || busy}
        title={isActive ? "Deactivate account" : "Activate account"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
          disabled:opacity-50
          ${isActive
            ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900"
            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 dark:bg-slate-800/50 dark:text-slate-500 dark:border-slate-700 dark:hover:bg-green-950/20 dark:hover:text-green-400 dark:hover:border-green-900"
          }`}
      >
        {busy
          ? <Loader2 size={11} className="portal-animate-spin" />
          : isActive ? <PowerOff size={11} /> : <Power size={11} />
        }
        {isActive ? "Active" : "Inactive"}
      </button>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

export default function AdminConsole() {
  const { user } = useAuth();
  const canManageUsers = isSystemAdmin(user);

  const [tab, setTab] = useState("Overview");
  const [analytics, setAnalytics] = useState(null);
  const [sources, setSources] = useState(null);
  const [articles, setArticles] = useState([]);
  const [articlesPage, setArticlesPage] = useState(1);
  const [articlesTotal, setArticlesTotal] = useState(0);
  const [articlesListLoading, setArticlesListLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const articlesPageEffectPrimed = useRef(false);
  const [reindexing, setReindexing] = useState(false);
  const [deletingSource, setDeletingSource] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [rawFilesPage, setRawFilesPage] = useState(1);
  const [reconFilter, setReconFilter] = useState("all");

  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsItems, setLogsItems] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsAnswered, setLogsAnswered] = useState("all");
  const [logsIntent, setLogsIntent] = useState("");
  const [logsSearch, setLogsSearch] = useState("");
  const [logsDebounced, setLogsDebounced] = useState("");
  const [logsNonce, setLogsNonce] = useState(0);

  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditItems, setAuditItems] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditDebounced, setAuditDebounced] = useState("");
  const [auditNonce, setAuditNonce] = useState(0);

  const reconciliationRows = sources?.reconciliation ?? [];
  const filteredReconciliation = useMemo(() => {
    if (!reconciliationRows.length) return [];
    if (reconFilter === "all") return reconciliationRows;
    return reconciliationRows.filter((r) => r.situation === reconFilter);
  }, [reconciliationRows, reconFilter]);

  const reconSituationCounts = useMemo(() => {
    const m = Object.fromEntries(Object.keys(RECON_SITUATION_META).map((k) => [k, 0]));
    for (const r of reconciliationRows) {
      if (m[r.situation] !== undefined) m[r.situation] += 1;
    }
    return m;
  }, [reconciliationRows]);

  const fetchArticlesSlice = useCallback((page) => {
    setArticlesListLoading(true);
    const offset = (page - 1) * ADMIN_ARTICLES_PAGE_SIZE;
    return listArticles({ limit: ADMIN_ARTICLES_PAGE_SIZE, offset })
      .then((art) => {
        const items = art.items || [];
        const t = typeof art.total === "number" ? art.total : items.length;
        if (items.length === 0 && t > 0 && page > 1) {
          setArticlesPage(1);
          return;
        }
        setArticles(items);
        setArticlesTotal(t);
      })
      .catch(() => {
        setArticles([]);
        setArticlesTotal(0);
      })
      .finally(() => setArticlesListLoading(false));
  }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getAnalytics(),
      getAdminSources().catch(() => null),
      listArticles({ limit: ADMIN_ARTICLES_PAGE_SIZE, offset: 0 }),
    ]).then(([an, src, art]) => {
      setAnalytics(an);
      setSources(src);
      const items = art.items || [];
      const t = typeof art.total === "number" ? art.total : items.length;
      setArticles(items);
      setArticlesTotal(t);
    }).catch(() => { }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    setRawFilesPage(1);
  }, [sources?.raw_files?.length, sources?.processed_files?.length]);

  useEffect(() => {
    if (loading) return;
    if (!articlesPageEffectPrimed.current) {
      articlesPageEffectPrimed.current = true;
      return;
    }
    fetchArticlesSlice(articlesPage);
  }, [articlesPage, loading, fetchArticlesSlice]);

  useEffect(() => {
    const t = setTimeout(() => setLogsDebounced(logsSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [logsSearch]);

  useEffect(() => {
    const t = setTimeout(() => setAuditDebounced(auditSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [auditSearch]);

  useEffect(() => {
    setLogsPage(1);
  }, [logsDebounced, logsAnswered, logsIntent]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditDebounced]);

  useEffect(() => {
    if (tab !== "Logs") return undefined;
    let cancelled = false;
    setLogsLoading(true);
    const params = {
      limit: ADMIN_LOGS_PAGE_SIZE,
      offset: (logsPage - 1) * ADMIN_LOGS_PAGE_SIZE,
    };
    if (logsAnswered === "yes") params.answered = true;
    else if (logsAnswered === "no") params.answered = false;
    if (logsIntent.trim()) params.query_type = logsIntent.trim();
    if (logsDebounced) params.q = logsDebounced;
    listAdminQueryLogs(params)
      .then((data) => {
        if (!cancelled) {
          setLogsTotal(data.total ?? 0);
          setLogsItems(data.items ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLogsItems([]);
          setLogsTotal(0);
          notifyApiError(e, "Could not load query logs.");
        }
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, logsPage, logsDebounced, logsAnswered, logsIntent, logsNonce]);

  useEffect(() => {
    if (tab !== "Audit") return undefined;
    let cancelled = false;
    setAuditLoading(true);
    const params = {
      limit: ADMIN_AUDIT_PAGE_SIZE,
      offset: (auditPage - 1) * ADMIN_AUDIT_PAGE_SIZE,
    };
    if (auditDebounced) params.q = auditDebounced;
    listAdminAuditEvents(params)
      .then((data) => {
        if (!cancelled) {
          setAuditTotal(data.total ?? 0);
          setAuditItems(data.items ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setAuditItems([]);
          setAuditTotal(0);
          notifyApiError(e, "Could not load audit events.");
        }
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, auditPage, auditDebounced, auditNonce]);

  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deletingArticleId, setDeletingArticleId] = useState(null);

  const refreshUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const data = await listUsers();
      setUsers(data.items || []);
    } catch (err) {
      setUsersError("Failed to load users.");
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUserUpdated = (updated) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  };

  const handleDeleteUser = async (userId) => {
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeletingUserId(null);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to delete user.";
      setUsersError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setDeletingUserId(null);
    }
  };

  useEffect(() => {
    if (tab !== "Users" || !canManageUsers) return;
    let cancelled = false;
    setUsersLoading(true);
    setUsersError(null);
    listUsers()
      .then((data) => {
        if (!cancelled) setUsers(data.items || []);
      })
      .catch((err) => {
        if (!cancelled) setUsersError(parseApiError(err));
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, canManageUsers]);

  const handleUserCreated = async (payload) => {
    await createUser(payload);
    await refreshUsers();
    notifySuccess("User created.");
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const r = await triggerReindex(true);
      notifySuccess(r.message || "Reindex job started.");
    } catch (e) {
      notifyApiError(e, "Could not start reindex.");
    } finally {
      setReindexing(false);
    }
  };

  const handleDeleteSource = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}? This will not remove it from the search index until you Re-index.`)) return;
    setDeletingSource(filename);
    try {
      await deleteRawSource(filename);
      const s = await getAdminSources();
      setSources(s);
      notifySuccess(`Removed ${filename} from raw ingest.`);
    } catch (e) {
      notifyApiError(e, "Could not delete file.");
    } finally {
      setDeletingSource(null);
    }
  };

  const handleApprove = async (id) => {
    try {
      const u = await approveArticle(id);
      setArticles((p) => p.map((a) => (a.id === id ? u : a)));
      notifySuccess("Article published.");
    } catch (e) {
      notifyApiError(e);
    }
  };
  const handleArchive = async (id) => {
    try {
      const u = await archiveArticle(id);
      setArticles((p) => p.map((a) => (a.id === id ? u : a)));
      notifySuccess("Article archived.");
    } catch (e) {
      notifyApiError(e);
    }
  };
  const handleUnarchive = async (id) => {
    try {
      const u = await unarchiveArticle(id);
      setArticles((p) => p.map((a) => (a.id === id ? u : a)));
      notifySuccess("Article restored to published.");
    } catch (e) {
      notifyApiError(e);
    }
  };
  const handleSubmitRev = async (id) => {
    try {
      const u = await submitReview(id);
      setArticles((p) => p.map((a) => (a.id === id ? u : a)));
      notifySuccess("Submitted for review.");
    } catch (e) {
      notifyApiError(e);
    }
  };
  const handleCreate = async (d) => {
    try {
      const created = await createArticle(d);
      if (articlesPage === 1) {
        await fetchArticlesSlice(1);
      } else {
        setArticlesPage(1);
      }
      notifySuccess("Draft article created.");
      return created;
    } catch (e) {
      notifyApiError(e);
      throw e;
    }
  };

  const handleDeleteArticle = async (article) => {
    const title = article?.title || "this article";
    if (!window.confirm(`Permanently delete “${title}”? Bookmarks and version history are removed. This cannot be undone.`)) return;
    setDeletingArticleId(article.id);
    try {
      await deleteArticle(article.id);
      notifySuccess("Article deleted.");
      await fetchArticlesSlice(articlesPage);
    } catch (e) {
      notifyApiError(e, "Could not delete article.");
    } finally {
      setDeletingArticleId(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-28 min-h-[50vh]">
      <PageSpinner title="Loading admin console…" subtitle="Fetching analytics and content" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Helmet>
        <title>{`Admin Console — ${BRAND.name}`}</title>
      </Helmet>

      <header className="mb-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-secondary">
            <LayoutDashboard size={12} className="text-primary shrink-0" aria-hidden="true" />
            Admin console
          </div>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground tracking-tight">Admin Console</h1>
          <p className="text-sm text-secondary mt-2 max-w-xl leading-relaxed">
            Operational visibility across content quality, search health, and platform users.
          </p>
        </div>
      </header>

      {/* Pill-style Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-8 p-1.5 rounded-2xl bg-surface border border-border w-full sm:w-fit shadow-sm max-w-full">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300
              ${tab === id
                ? "bg-primary text-white shadow-lg shadow-primary/25 translate-y-[-1px]"
                : "text-secondary hover:text-foreground hover:bg-surface-hover"
              }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">

        {/* ── Overview ── */}
        {tab === "Overview" && analytics && (
          <motion.div
            key="overview"
            className="space-y-5"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Articles" value={analytics.total_articles} Icon={FileText} />
              <StatCard label="Total Queries" value={analytics.total_queries} Icon={BarChart3} />
              <StatCard label="Helpful Feedback" value={analytics.helpful_feedback} tone="success" Icon={CheckCircle} />
              <StatCard label="Unanswered" value={analytics.unanswered_queries}
                tone={analytics.unanswered_queries > 10 ? "warning" : "default"} Icon={TrendingDown} />
            </div>

            {/* Article status distribution */}
            {analytics.status_breakdown && Object.keys(analytics.status_breakdown).length > 0 && (
              <div className="p-6 rounded-[1.5rem] border border-border bg-surface shadow-sm">
                <p className="text-[11px] font-bold text-secondary uppercase tracking-[0.12em] mb-6">Status Distribution</p>

                <div className="space-y-6">
                  {/* Visual Bar */}
                  <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
                    {Object.entries(analytics.status_breakdown).map(([s, c], i) => (
                      <div
                        key={s}
                        style={{ width: `${(c / (analytics.total_articles || 1)) * 100}%` }}
                        className={`h-full transition-all duration-500 hover:opacity-80
                          ${s === "published" ? "bg-primary" : i % 2 === 0 ? "bg-accent" : "bg-secondary"}`}
                      />
                    ))}
                  </div>

                  <div className="flex gap-10 flex-wrap">
                    {Object.entries(analytics.status_breakdown).map(([s, c], i) => (
                      <div key={s} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${s === "published" ? "bg-primary" : i % 2 === 0 ? "bg-accent" : "bg-secondary"}`} />
                          <p className="text-xl font-bold text-foreground">{c}</p>
                        </div>
                        <p className="text-[10px] font-semibold text-secondary uppercase tracking-wide ml-4 opacity-70">
                          {s.replace("_", " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Knowledge Gaps */}
            {analytics.top_knowledge_gaps?.length > 0 && (
              <div className="p-6 rounded-[1.5rem] border border-border bg-surface shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <TrendingDown size={16} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Knowledge Gaps</p>
                    <p className="text-[10px] text-secondary opacity-70 uppercase tracking-widest font-bold">Unanswered Queries</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {analytics.top_knowledge_gaps.map((gap, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-background/50 rounded-xl border border-border/50 hover:border-primary/20 transition-colors">
                      <p className="text-xs font-medium text-foreground truncate flex-1 mr-4 italic">"{gap.query}"</p>
                      <span className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900 flex-shrink-0 font-bold">
                        {gap.count} hits
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expiry alert */}
            {analytics.expiring_soon_count > 0 && (
              <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">
                  <strong>{analytics.expiring_soon_count}</strong> article{analytics.expiring_soon_count > 1 ? "s" : ""} expiring soon. Please review for renewal.
                </p>
              </div>
            )}

            {/* Vector index */}
            {sources && (
              <div className="p-6 rounded-[1.5rem] border border-border bg-surface shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Database size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Vector Index</p>
                      <p className="text-[10px] text-secondary opacity-70 uppercase tracking-widest font-bold">Search Engine Status</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={handleReindex} disabled={reindexing}
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-surface border border-border hover:border-primary/40 hover:bg-surface-hover shadow-sm transition-all disabled:opacity-50">
                      <RefreshCw size={14} className={reindexing ? "portal-animate-spin" : ""} />
                      {reindexing ? "Re-indexing..." : "Re-index Now"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 mb-8">
                  <div>
                    <p className="text-3xl font-extrabold text-foreground tracking-tight">{sources.collection_count ?? 0}</p>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-1.5 opacity-60">Embedded chunks</p>
                    <p className="text-[11px] text-secondary/80 mt-2 leading-relaxed">Vectors in Chroma for this collection.</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-foreground tracking-tight">{sources.processed_files?.length ?? 0}</p>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-1.5 opacity-60">Processed JSON</p>
                    <p className="text-[11px] text-secondary/80 mt-2 leading-relaxed">Aggregate JSON artifacts under <code className="text-[10px]">data/processed</code> (not one file per PDF). Use reconciliation below to compare PDFs to the index.</p>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-foreground tracking-tight">{sources.raw_files?.length ?? 0}</p>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mt-1.5 opacity-60">Raw PDFs</p>
                    <p className="text-[11px] text-secondary/80 mt-2 leading-relaxed">Files in <code className="text-[10px]">data/raw</code> (uploads + pipeline inputs).</p>
                  </div>
                </div>

                {reconciliationRows.length > 0 && (
                  <div className="mt-2 border border-border/60 rounded-xl overflow-hidden bg-background/30">
                    <div className="px-4 py-3 border-b border-border/60 bg-surface/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">Source reconciliation</p>
                        <p className="text-[11px] text-secondary mt-1 leading-relaxed max-w-2xl">
                          RAG ingestion and KB articles are intentionally decoupled: a PDF can be searchable before a portal article exists.
                          Rows match PDF basenames (from disk, Chroma metadata, ingest registry, or <code className="text-[10px]">article.system_name</code> ending in .pdf).
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-secondary shrink-0">
                        <span className="font-semibold text-foreground/80">Filter</span>
                        <select
                          value={reconFilter}
                          onChange={(e) => setReconFilter(e.target.value)}
                          className="text-xs font-medium rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                        >
                          <option value="all">All situations ({reconciliationRows.length})</option>
                          {Object.entries(RECON_SITUATION_META).map(([k, { label }]) => (
                            <option key={k} value={k}>
                              {label} ({reconSituationCounts[k] ?? 0})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="overflow-x-auto max-h-[min(420px,55vh)] overflow-y-auto">
                      <table className="w-full text-left text-xs min-w-[720px]">
                        <thead className="sticky top-0 bg-surface border-b border-border/60 uppercase text-[10px] tracking-wider text-secondary font-bold z-10">
                          <tr>
                            <th className="px-3 py-2.5">PDF</th>
                            <th className="px-3 py-2.5">Raw</th>
                            <th className="px-3 py-2.5">Registry</th>
                            <th className="px-3 py-2.5">Vector</th>
                            <th className="px-3 py-2.5">Articles</th>
                            <th className="px-3 py-2.5">Situation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {filteredReconciliation.map((row) => (
                            <tr key={row.file_name_key} className="hover:bg-surface/40">
                              <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap max-w-[220px] truncate" title={row.file_name}>
                                {row.file_name}
                              </td>
                              <td className="px-3 py-2 text-secondary">{row.has_raw ? "Yes" : "—"}</td>
                              <td className="px-3 py-2 text-secondary">{row.in_ingest_registry ? "Yes" : "—"}</td>
                              <td className="px-3 py-2 text-secondary">{row.in_vector_index ? "Yes" : "—"}</td>
                              <td className="px-3 py-2 text-secondary">
                                {row.article_count > 0 ? (
                                  <div className="flex flex-col gap-0.5">
                                    {row.articles.map((a) => (
                                      <Link
                                        key={a.id}
                                        to={`/portal/knowledge/articles/${a.id}`}
                                        className="text-primary hover:underline truncate max-w-[200px]"
                                        title={a.title}
                                      >
                                        {a.title}
                                      </Link>
                                    ))}
                                    {row.article_count > row.articles.length ? (
                                      <span className="text-[10px] opacity-70">+{row.article_count - row.articles.length} more</span>
                                    ) : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${RECON_BADGE[row.situation] || RECON_BADGE.registry_only}`}
                                  title={RECON_SITUATION_META[row.situation]?.hint}
                                >
                                  {RECON_SITUATION_META[row.situation]?.label ?? row.situation}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filteredReconciliation.length === 0 && (
                      <p className="px-4 py-6 text-center text-xs text-secondary">No rows for this filter.</p>
                    )}
                  </div>
                )}

                {/* Raw Files Management */}
                {sources.raw_files && sources.raw_files.length > 0 && (() => {
                  const rawAll = sources.raw_files;
                  const rawTotal = rawAll.length;
                  const rawOffset = (rawFilesPage - 1) * RAW_FILES_PAGE_SIZE;
                  const rawPageRows = rawAll.slice(rawOffset, rawOffset + RAW_FILES_PAGE_SIZE);
                  const rawTable = (
                    <div className="border border-border/60 rounded-xl overflow-hidden overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap min-w-[520px]">
                        <thead className="bg-surface border-b border-border/60 uppercase text-[10px] tracking-wider text-secondary font-bold">
                          <tr>
                            <th className="px-4 py-3">File Name</th>
                            <th className="px-4 py-3">Size</th>
                            <th className="px-4 py-3 w-10">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {rawPageRows.map((file) => (
                            <tr key={file.name} className="hover:bg-surface/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <FileIcon size={14} className="text-primary/70" />
                                  <span className="font-medium text-foreground">{file.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-secondary">
                                {(file.size_bytes / 1024).toFixed(1)} KB
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleDeleteSource(file.name)}
                                  disabled={deletingSource === file.name}
                                  className="p-1.5 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                  title="Delete raw file"
                                >
                                  {deletingSource === file.name ? <Loader2 size={16} className="portal-animate-spin" /> : <Trash2 size={16} />}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                  return (
                    <div className="mt-6 border-t border-border/50 pt-6">
                      <p className="text-sm font-bold text-foreground mb-1">Raw storage (uploaded PDFs)</p>
                      <p className="text-xs text-secondary mb-4">
                        Listing matches folder scan — not hardcoded. If processed JSON count is lower, run <strong className="text-foreground">Re-index</strong> so every PDF gets a manifest and chunks.
                      </p>
                      {rawTotal > RAW_FILES_PAGE_SIZE ? (
                        <PaginationBar
                          bothEnds
                          page={rawFilesPage}
                          pageSize={RAW_FILES_PAGE_SIZE}
                          total={rawTotal}
                          onPageChange={setRawFilesPage}
                          idPrefix="admin-raw-pdfs"
                        >
                          {rawTable}
                        </PaginationBar>
                      ) : (
                        rawTable
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </motion.div>
        )}

        {/* ── App logs (query_logs) ── */}
        {tab === "Logs" && (
          <motion.div
            key="logs"
            className="space-y-4"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="rounded-[1.5rem] border border-border bg-surface shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-border/70 bg-gradient-to-br from-surface to-primary/[0.03]">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/12 flex items-center justify-center shrink-0">
                      <ScrollText size={22} className="text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground tracking-tight">Application logs</h2>
                      <p className="text-xs text-secondary mt-1 max-w-xl leading-relaxed">
                        RAG and chat requests recorded in <code className="text-[10px] px-1 py-0.5 rounded bg-background border border-border/80">query_logs</code>
                        . Use filters to narrow by outcome, intent, or query text.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogsNonce((n) => n + 1)}
                    className="inline-flex items-center justify-center gap-2 self-start px-4 py-2.5 rounded-xl text-xs font-bold border-2 border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm"
                  >
                    <RefreshCw size={14} className={logsLoading ? "portal-animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                <div className="mt-5 flex flex-col xl:flex-row flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-secondary">
                    <span className="whitespace-nowrap">Answered</span>
                    <select
                      value={logsAnswered}
                      onChange={(e) => setLogsAnswered(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground min-w-[8rem]"
                    >
                      <option value="all">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-secondary flex-1 min-w-[10rem]">
                    <span className="whitespace-nowrap">Intent</span>
                    <input
                      value={logsIntent}
                      onChange={(e) => setLogsIntent(e.target.value)}
                      placeholder="e.g. general"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-secondary flex-1 min-w-[12rem] xl:min-w-[16rem]">
                    <Search size={14} className="opacity-60 shrink-0" />
                    <input
                      value={logsSearch}
                      onChange={(e) => setLogsSearch(e.target.value)}
                      placeholder="Search query text…"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
                    />
                  </label>
                </div>
              </div>

              <PaginationBar
                bothEnds
                page={logsPage}
                pageSize={ADMIN_LOGS_PAGE_SIZE}
                total={logsTotal}
                onPageChange={setLogsPage}
                idPrefix="admin-query-logs"
                className="px-5 sm:px-6 pb-5 sm:pb-6"
              >
                <div className="relative overflow-x-auto">
                  {logsLoading && (
                    <div className="absolute inset-0 z-[1] bg-surface/60 flex items-center justify-center backdrop-blur-[1px]">
                      <Loader2 size={28} className="portal-animate-spin text-primary/70" />
                    </div>
                  )}
                  <table className="w-full text-left text-xs min-w-[820px] border-b border-border/50">
                    <thead className="bg-background/80 border-b border-border/70 uppercase text-[10px] tracking-wider text-secondary font-bold">
                      <tr>
                        <th className="px-4 py-3 font-bold">Time</th>
                        <th className="px-4 py-3 font-bold">User</th>
                        <th className="px-4 py-3 font-bold">Query</th>
                        <th className="px-4 py-3 font-bold">Intent</th>
                        <th className="px-4 py-3 font-bold">Domain</th>
                        <th className="px-4 py-3 font-bold">Chunks</th>
                        <th className="px-4 py-3 font-bold">ms</th>
                        <th className="px-4 py-3 font-bold">Answered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {logsItems.length === 0 && !logsLoading ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-14 text-center text-secondary text-sm">
                            No query logs match these filters.
                          </td>
                        </tr>
                      ) : (
                        logsItems.map((row) => (
                          <tr key={row.id} className="hover:bg-primary/[0.04] transition-colors">
                            <td className="px-4 py-3 text-secondary whitespace-nowrap tabular-nums">{formatAdminTs(row.created_at)}</td>
                            <td className="px-4 py-3 text-secondary max-w-[140px] truncate" title={row.user_email || row.user_id || ""}>
                              {row.user_email || row.user_id || "—"}
                            </td>
                            <td className="px-4 py-3 text-foreground max-w-[280px]">
                              <span className="font-mono text-[11px] leading-snug line-clamp-2" title={row.query_text}>
                                {clipText(row.query_text, 200)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-secondary whitespace-nowrap">{row.query_type || "—"}</td>
                            <td className="px-4 py-3 text-secondary whitespace-nowrap">{row.domain_filter || "—"}</td>
                            <td className="px-4 py-3 text-secondary tabular-nums">{row.result_count ?? 0}</td>
                            <td className="px-4 py-3 text-secondary tabular-nums">{row.latency_ms ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                                  row.answered
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:border-emerald-900"
                                    : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-900"
                                }`}
                              >
                                {row.answered ? "Yes" : "No"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </PaginationBar>
            </div>
          </motion.div>
        )}

        {/* ── Audit (article_versions) ── */}
        {tab === "Audit" && (
          <motion.div
            key="audit"
            className="space-y-4"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="rounded-[1.5rem] border border-border bg-surface shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-border/70 bg-gradient-to-br from-surface to-violet-500/[0.04]">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-violet-500/12 flex items-center justify-center shrink-0">
                      <History size={22} className="text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground tracking-tight">Audit trail</h2>
                      <p className="text-xs text-secondary mt-1 max-w-xl leading-relaxed">
                        Article version history: creates, edits, and status transitions. Links open the current article in the portal.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuditNonce((n) => n + 1)}
                    className="inline-flex items-center justify-center gap-2 self-start px-4 py-2.5 rounded-xl text-xs font-bold border-2 border-border bg-background hover:border-violet-500/35 hover:bg-violet-500/5 transition-all shadow-sm"
                  >
                    <RefreshCw size={14} className={auditLoading ? "portal-animate-spin" : ""} />
                    Refresh
                  </button>
                </div>
                <label className="mt-5 flex items-center gap-2 text-xs font-semibold text-secondary max-w-lg">
                  <Search size={14} className="opacity-60 shrink-0" />
                  <input
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search title or change note…"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
                  />
                </label>
              </div>

              <PaginationBar
                bothEnds
                page={auditPage}
                pageSize={ADMIN_AUDIT_PAGE_SIZE}
                total={auditTotal}
                onPageChange={setAuditPage}
                idPrefix="admin-audit"
                className="px-5 sm:px-6 pb-5 sm:pb-6"
              >
                <div className="relative overflow-x-auto">
                  {auditLoading && (
                    <div className="absolute inset-0 z-[1] bg-surface/60 flex items-center justify-center backdrop-blur-[1px]">
                      <Loader2 size={28} className="portal-animate-spin text-violet-500/80" />
                    </div>
                  )}
                  <table className="w-full text-left text-xs min-w-[760px] border-b border-border/50">
                    <thead className="bg-background/80 border-b border-border/70 uppercase text-[10px] tracking-wider text-secondary font-bold">
                      <tr>
                        <th className="px-4 py-3 font-bold">Time</th>
                        <th className="px-4 py-3 font-bold">Article</th>
                        <th className="px-4 py-3 font-bold">Ver</th>
                        <th className="px-4 py-3 font-bold">Actor</th>
                        <th className="px-4 py-3 font-bold">Change</th>
                        <th className="px-4 py-3 font-bold w-24"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {auditItems.length === 0 && !auditLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-14 text-center text-secondary text-sm">
                            No audit events yet, or nothing matches your search.
                          </td>
                        </tr>
                      ) : (
                        auditItems.map((row) => (
                          <tr key={row.id} className="hover:bg-violet-500/[0.04] transition-colors">
                            <td className="px-4 py-3 text-secondary whitespace-nowrap tabular-nums">{formatAdminTs(row.created_at)}</td>
                            <td className="px-4 py-3 text-foreground font-medium max-w-[220px]">
                              <span className="line-clamp-2" title={row.article_title}>{row.article_title}</span>
                            </td>
                            <td className="px-4 py-3 text-secondary tabular-nums font-mono">{row.version_number}</td>
                            <td className="px-4 py-3 text-secondary max-w-[160px] truncate" title={row.actor_email || row.changed_by || ""}>
                              {row.actor_email || row.changed_by || "—"}
                            </td>
                            <td className="px-4 py-3 text-secondary max-w-[360px]">
                              <span className="font-mono text-[11px] leading-snug line-clamp-2" title={row.change_note || ""}>
                                {clipText(row.change_note, 220)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                to={`/portal/knowledge/articles/${row.article_id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                              >
                                Open <ExternalLink size={12} />
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </PaginationBar>
            </div>
          </motion.div>
        )}

        {/* ── Articles ── */}
        {tab === "Articles" && (
          <motion.div
            key="articles"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                {articlesTotal} article{articlesTotal !== 1 ? "s" : ""} total
                {articlesListLoading ? " · Loading…" : ""}
              </p>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm shadow-primary/20">
                <Plus size={13} /> New Article
              </button>
            </div>

            {!articlesListLoading && articles.length === 0 && articlesTotal === 0 ? (
              <div className="py-16 text-center rounded-xl border border-dashed border-border">
                <FileText size={26} className="mx-auto text-secondary mb-2.5 opacity-30" />
                <p className="text-sm text-secondary">No articles yet.</p>
                <p className="text-xs text-secondary/60 mt-1">Create above or ingest PDFs and reindex.</p>
              </div>
            ) : (
              <div className={articlesListLoading ? "opacity-60 pointer-events-none" : ""}>
                {(() => {
                  const articleTable = (
                    <div className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
                      {articles.length === 0 && articlesListLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 size={22} className="portal-animate-spin text-secondary/50" />
                        </div>
                      ) : (
                        articles.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                              <div className="flex items-center gap-2.5 mt-0.5">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[a.status] || ""}`}>
                                  {a.status.replace("_", " ")}
                                </span>
                                {a.domain && <span className="text-xs text-secondary">{a.domain}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingArticle(a)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface-hover hover:border-primary/30 transition-all"
                                title="Edit article and linked PDF"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <Link
                                to={`/portal/knowledge/articles/${a.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-primary hover:bg-primary/5 hover:border-primary/35 transition-all"
                                title="Open article in the knowledge portal"
                              >
                                <ExternalLink size={13} /> View
                              </Link>
                              {a.status === "draft" && (
                                <button onClick={() => handleSubmitRev(a.id)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface-hover hover:border-primary/30 transition-all">
                                  Submit for Review
                                </button>
                              )}
                              {a.status === "in_review" && (
                                <button onClick={() => handleApprove(a.id)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950/50 transition-all flex items-center gap-1.5">
                                  <CheckCircle size={12} /> Approve
                                </button>
                              )}
                              {a.status === "published" && (
                                <button onClick={() => handleArchive(a.id)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-secondary hover:text-red-500 hover:border-red-300 dark:hover:border-red-800 transition-all">
                                  Archive
                                </button>
                              )}
                              {a.status === "archived" && (
                                <button onClick={() => handleUnarchive(a.id)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-all">
                                  Unarchive
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteArticle(a)}
                                disabled={deletingArticleId === a.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40 transition-all disabled:opacity-50"
                                title="Permanently delete article"
                              >
                                {deletingArticleId === a.id ? <Loader2 size={14} className="portal-animate-spin" /> : <Trash2 size={14} />}
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                  if (articlesTotal > 0) {
                    return (
                      <PaginationBar
                        bothEnds
                        page={articlesPage}
                        pageSize={ADMIN_ARTICLES_PAGE_SIZE}
                        total={articlesTotal}
                        onPageChange={setArticlesPage}
                        idPrefix="admin-articles"
                      >
                        {articleTable}
                      </PaginationBar>
                    );
                  }
                  return articleTable;
                })()}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Users ── */}
        {tab === "Users" && !canManageUsers && (
          <motion.div
            key="users-restricted"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="p-5 rounded-xl border border-border bg-surface flex gap-3"
          >
            <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">User management is restricted</p>
              <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                System admins only for listing and creating users. Knowledge admins keep Overview and Articles.
              </p>
            </div>
          </motion.div>
        )}

        {tab === "Users" && canManageUsers && (
          <motion.div
            key="users"
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                {usersLoading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshUsers}
                  disabled={usersLoading}
                  title="Refresh"
                  className="p-2 rounded-lg border border-border text-secondary hover:text-foreground hover:bg-surface-hover disabled:opacity-40 transition-all"
                >
                  <RefreshCw size={13} className={usersLoading ? "portal-animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowUserModal(true)}
                  disabled={usersLoading}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm shadow-primary/20"
                >
                  <Plus size={13} /> New user
                </button>
              </div>
            </div>

            {/* Error banner */}
            {usersError && (
              <div className="mb-4 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 flex gap-2">
                <AlertCircle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-200">{usersError}</p>
              </div>
            )}

            {/* Hint */}
            <p className="text-[11px] text-secondary/70 mb-3 flex items-center gap-1.5">
              <UserCog size={11} />
              Click a role badge to change it · Click Active/Inactive to toggle account status
            </p>

            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={22} className="portal-animate-spin text-secondary/50" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center rounded-xl border border-dashed border-border">
                <Users size={26} className="mx-auto text-secondary mb-2.5 opacity-30" />
                <p className="text-sm text-secondary">No users returned.</p>
                <p className="text-xs text-secondary/60 mt-1">Create one with New user or verify accounts exist.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background/80 text-left text-[11px] font-semibold uppercase tracking-wider text-secondary">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Role <span className="text-primary/60 normal-case font-normal">(click to change)</span></th>
                        <th className="px-4 py-3 hidden md:table-cell">Team</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Dept</th>
                        <th className="px-4 py-3">Status <span className="text-primary/60 normal-case font-normal">(click to toggle)</span></th>
                        <th className="px-4 py-3 hidden xl:table-cell">Created</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.map((u) => {
                        const isSelf = u.id === user?.id;
                        return (
                          <tr key={u.id} className={`hover:bg-surface-hover/60 transition-colors ${!u.is_active ? "opacity-60" : ""}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
                                  ${u.is_active ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"}`}>
                                  {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{u.full_name || "—"}</p>
                                  <p className="text-xs text-secondary truncate max-w-[160px]" title={u.email}>{u.email}</p>
                                </div>
                                {isSelf && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold flex-shrink-0">You</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <RoleDropdown
                                userId={u.id}
                                currentRole={u.role}
                                onChanged={handleUserUpdated}
                                disabled={isSelf}
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-secondary hidden md:table-cell">{u.team || "—"}</td>
                            <td className="px-4 py-3 text-xs text-secondary hidden lg:table-cell">{u.department || "—"}</td>
                            <td className="px-4 py-3">
                              <ActiveToggle
                                userId={u.id}
                                isActive={u.is_active}
                                onChanged={handleUserUpdated}
                                disabled={isSelf}
                              />
                            </td>
                            <td className="px-4 py-3 hidden xl:table-cell text-secondary text-[11px] whitespace-nowrap">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, {
                                year: "2-digit", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"
                              }) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isSelf ? (
                                <div className="w-8 h-8 ml-auto flex items-center justify-center opacity-20" title="Cannot delete self">
                                  <Trash2 size={14} />
                                </div>
                              ) : deletingUserId === u.id ? (
                                <div className="flex items-center justify-end gap-1.5 animate-in fade-in slide-in-from-right-1 duration-200">
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="px-2 py-1 text-[10px] font-bold bg-red-600 text-white rounded-md hover:bg-red-700 shadow-sm"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setDeletingUserId(null)}
                                    className="p-1 text-secondary hover:text-foreground"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingUserId(u.id)}
                                  className="p-2 rounded-lg text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                  title="Delete user"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}


      </AnimatePresence>

      {showModal && (
        <ArticleModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          rawFiles={sources?.raw_files ?? []}
        />
      )}
      {editingArticle && (
        <EditArticleModal
          article={editingArticle}
          rawFiles={sources?.raw_files ?? []}
          onClose={() => setEditingArticle(null)}
          onSaved={(updated) => {
            setArticles((p) => p.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
            setEditingArticle(null);
            notifySuccess("Article updated.");
          }}
        />
      )}
      {showUserModal && (
        <CreateUserModal onClose={() => setShowUserModal(false)} onCreated={handleUserCreated} />
      )}
    </div>
  );
}
