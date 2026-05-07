import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import client, { getArticle, listBookmarks, addBookmark, removeBookmark, approveArticle, submitReview } from "../api/client";
import {
  ArrowLeft,
  Tag,
  Calendar,
  AlertCircle,
  ScrollText,
  BookOpen,
  Maximize2,
  FileCode2,
  FileText,
  Printer,
  Loader2,
  Download,
  Bookmark,
  CheckCircle2,
  Send,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ArticleDetailSkeleton } from "../components/ui/Skeleton";
import { BRAND } from "../lib/brand";
import { useAuth } from "../context/AuthContext";
import { canApproveArticles, isAdmin } from "../lib/roles";
import { notifyError, notifySuccess, notifyApiError } from "../lib/notify";

const DOMAIN_PILL = {
  application: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200",
  banking: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200",
  process: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  tribal: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  general: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const VIEW_MODES = [
  { id: "reading", label: "Article", icon: BookOpen },
  { id: "focus", label: "Focus", icon: Maximize2 },
  { id: "raw", label: "Source", icon: FileCode2 },
  { id: "pdf", label: "PDF", icon: FileText },
];

export default function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("reading");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [governanceBusy, setGovernanceBusy] = useState(false);
  const pdfBlobRef = useRef(null);

  const revokePdf = useCallback(() => {
    if (pdfBlobRef.current) {
      URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = null;
    }
    setPdfPreviewUrl(null);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setView("reading");
    revokePdf();
    setPdfError(null);
    setFileError(null);
    setPdfDownloadBusy(false);
    getArticle(id)
      .then(setArticle)
      .catch((err) => {
        const msg = err?.response?.data?.error?.message || "Failed to load article.";
        setError(msg);
        notifyError(msg);
      })
      .finally(() => setLoading(false));
  }, [id, revokePdf]);

  useEffect(() => {
    if (!id) return;
    listBookmarks()
      .then((res) => {
        const ids = new Set((res.items || []).map((b) => b.article_id));
        setBookmarked(ids.has(id));
      })
      .catch(() => setBookmarked(false));
  }, [id]);

  useEffect(() => () => revokePdf(), [revokePdf]);

  const toggleBookmark = async () => {
    if (!id) return;
    setBookmarkBusy(true);
    try {
      if (bookmarked) {
        await removeBookmark(id);
        setBookmarked(false);
        notifySuccess("Removed from bookmarks.");
      } else {
        await addBookmark(id);
        setBookmarked(true);
        notifySuccess("Saved to bookmarks.");
      }
    } catch (e) {
      notifyApiError(e, bookmarked ? "Could not remove bookmark." : "Could not save bookmark.");
    } finally {
      setBookmarkBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!id || !window.confirm("Approve and publish this article?")) return;
    setGovernanceBusy(true);
    try {
      const updated = await approveArticle(id, "Approved via Article view");
      setArticle(updated);
      notifySuccess("Article published.");
    } catch (err) {
      notifyApiError(err, "Approve failed.");
    } finally {
      setGovernanceBusy(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!id || !window.confirm("Submit this draft for expert review?")) return;
    setGovernanceBusy(true);
    try {
      const updated = await submitReview(id, "Submitted via Article view");
      setArticle(updated);
      notifySuccess("Submitted for review.");
    } catch (err) {
      notifyApiError(err, "Submission failed.");
    } finally {
      setGovernanceBusy(false);
    }
  };

  const hasLinkedPdf = Boolean(article?.system_name?.toLowerCase?.().endsWith(".pdf"));

  const loadPdfPreview = async () => {
    if (!id || !hasLinkedPdf) return;
    setPdfLoading(true);
    setPdfError(null);
    revokePdf();
    try {
      const res = await client.get(`/articles/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      pdfBlobRef.current = url;
      setPdfPreviewUrl(url);
    } catch {
      setPdfError("Unable to load PDF. Confirm the file is available in the document library and your session is valid.");
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!id || !hasLinkedPdf) return;
    setPdfDownloadBusy(true);
    setFileError(null);
    try {
      const res = await client.get(`/articles/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = article.system_name || "document.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setFileError("Download failed. Check the file exists in the document library and you are still signed in.");
    } finally {
      setPdfDownloadBusy(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) return <ArticleDetailSkeleton />;

  if (error || !article) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center">
        <Helmet>
          <title>Article — {BRAND.name}</title>
        </Helmet>
        <AlertCircle size={28} className="mx-auto text-red-500 mb-3" />
        <p className="text-sm text-foreground">{error || "Article not found."}</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-4 text-xs text-primary hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const color = DOMAIN_PILL[article.domain] || DOMAIN_PILL.general;
  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;

  const desc = article.summary || `${article.title} — ${BRAND.name}`;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 article-print-root">
      <Helmet>
        <title>{`${article.title} — ${BRAND.name}`}</title>
        <meta name="description" content={desc.slice(0, 160)} />
      </Helmet>

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="no-print flex items-center gap-1.5 text-xs text-secondary hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={13} /> Back
      </button>

      <header className="no-print mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="mt-0.5 w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/15 flex-shrink-0">
            <ScrollText size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground leading-tight tracking-tight">{article.title}</h1>
            {article.summary && <p className="text-sm text-secondary mt-2 leading-relaxed">{article.summary}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${color}`}>{article.domain}</span>
          {publishedDate && (
            <span className="flex items-center gap-1 text-xs text-secondary">
              <Calendar size={11} aria-hidden="true" /> {publishedDate}
            </span>
          )}
          {article.system_name && (
            <span className="text-xs text-secondary font-mono bg-surface-hover border border-border px-2 py-0.5 rounded-md">
              Reference: {article.system_name}
            </span>
          )}
          {article.tags?.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-xs text-secondary border border-border px-2 py-0.5 rounded-full">
              <Tag size={9} aria-hidden="true" />
              {tag}
            </span>
          ))}
        </div>

        {/* View mode toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-sm">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Document view">
            {VIEW_MODES.map((m) => {
              if (m.id === "pdf" && !hasLinkedPdf) return null;
              const Icon = m.icon;
              const active = view === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all
                    ${active ? "bg-primary text-white shadow-md shadow-primary/25" : "text-secondary hover:text-foreground hover:bg-surface-hover"}`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 sm:pr-1 flex-wrap justify-end">
            <button
              type="button"
              onClick={toggleBookmark}
              disabled={bookmarkBusy}
              aria-pressed={bookmarked}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50
                ${bookmarked
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-secondary hover:text-foreground hover:border-primary/30"
                }`}
            >
              {bookmarkBusy ? (
                <Loader2 size={14} className="portal-animate-spin" aria-hidden="true" />
              ) : (
                <Bookmark size={14} className={bookmarked ? "fill-primary/25" : ""} aria-hidden="true" />
              )}
              {bookmarked ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-secondary hover:text-foreground hover:border-primary/30 transition-colors"
            >
              <Printer size={14} aria-hidden="true" />
              Print
            </button>
            {hasLinkedPdf && (
              <button
                type="button"
                onClick={downloadPdf}
                disabled={pdfDownloadBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-secondary hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
              >
                {pdfDownloadBusy ? <Loader2 size={14} className="portal-animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                Download PDF
              </button>
            )}

            {article.status === "in_review" && canApproveArticles(user) && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={governanceBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 transition-colors disabled:opacity-50 shadow-md shadow-green-600/20"
              >
                {governanceBusy ? <Loader2 size={14} className="portal-animate-spin" /> : <CheckCircle2 size={14} />}
                Approve & Publish
              </button>
            )}

            {article.status === "draft" && isAdmin(user) && (
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={governanceBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
              >
                {governanceBusy ? <Loader2 size={14} className="portal-animate-spin" /> : <Send size={14} />}
                Submit for Review
              </button>
            )}
          </div>
        </div>
        {fileError && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2">
            {fileError}
          </p>
        )}
      </header>

      {/* Body */}
      <div className="article-body">
        {view === "raw" && (
          <div className="no-print rounded-2xl border border-border bg-slate-950 p-4 shadow-inner">
            <p className="text-[11px] font-medium text-slate-400 mb-2">Source text (copy-friendly)</p>
            <pre className="text-xs text-slate-100 font-mono whitespace-pre-wrap break-words max-h-[70vh] overflow-auto leading-relaxed">
              {article.content}
            </pre>
          </div>
        )}

        {view === "pdf" && hasLinkedPdf && (
          <div className="no-print app-card overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-surface-hover/50">
              <p className="text-xs text-secondary">
                Preview loads in your browser. For full controls, use <strong className="text-foreground">Open PDF</strong>.
              </p>
              <button
                type="button"
                onClick={loadPdfPreview}
                disabled={pdfLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {pdfLoading ? <Loader2 size={14} className="portal-animate-spin" /> : <FileText size={14} />}
                {pdfPreviewUrl ? "Reload preview" : "Load preview"}
              </button>
            </div>
            {pdfError && (
              <p className="text-xs text-red-600 dark:text-red-400 px-4 py-3 border-b border-border">{pdfError}</p>
            )}
            {pdfPreviewUrl && (
              <iframe
                title="PDF preview"
                src={pdfPreviewUrl}
                className="w-full min-h-[72vh] bg-slate-900/5 dark:bg-black/40"
              />
            )}
            {!pdfPreviewUrl && !pdfLoading && !pdfError && (
              <p className="text-sm text-secondary px-4 py-10 text-center">Load preview to embed the linked PDF here.</p>
            )}
          </div>
        )}

        {(view === "reading" || view === "focus") && (
          <article
            className={`article-prose rounded-2xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-8 shadow-sm print:border-0 print:shadow-none
              ${view === "focus" ? "max-w-2xl mx-auto text-[1.05rem] leading-[1.75] sm:px-10 sm:py-10 ring-1 ring-primary/10" : ""}`}
          >
            <div
              className={[
                "article-md max-w-none dark:prose-invert",
                view === "focus" ? "prose prose-base" : "prose prose-sm",
                "prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-tight",
                view === "focus"
                  ? "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-[1.05rem] prose-p:leading-[1.75] prose-li:text-[1.05rem]"
                  : "prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3 prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2 prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1 prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm",
                "prose-strong:font-semibold prose-strong:text-foreground",
                "prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-secondary",
                "[&>*:first-child]:mt-0 [&>ul:first-child]:mt-0 [&>ol:first-child]:mt-0",
              ].join(" ")}
            >
              <ReactMarkdown>{article.content || ""}</ReactMarkdown>
            </div>
          </article>
        )}
      </div>

      {article.expires_at && (
        <div className="no-print mt-8 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Expires {new Date(article.expires_at).toLocaleDateString()}. Confirm with the owning team before production use.
          </p>
        </div>
      )}
    </div>
  );
}
