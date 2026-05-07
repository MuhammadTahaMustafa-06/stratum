import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { search, listArticles, uploadPdf } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { isAdmin } from "../lib/roles";
import { parseApiError } from "../utils/apiError";
import {
  Search,
  FileText,
  ArrowRight,
  Loader2,
  Star,
  X,
  FileStack,
  Library,
  Upload,
  Sparkles,
  FolderUp,
  CheckCircle2,
  AlertCircle,
  ScrollText,
  LayoutDashboard,
  Bookmark,
} from "lucide-react";
import { BRAND } from "../lib/brand";
import { ArticleGridSkeleton, SearchGridSkeleton } from "../components/ui/Skeleton";
import { PaginationBar } from "../components/ui/PaginationBar";
import PortalBannerStack from "../components/PortalBannerStack";
import { notifyApiError, notifySuccess, notifyWarning } from "../lib/notify";

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

const HUB_ARTICLES_PAGE_SIZE = 12;

const DOMAINS = [
  { id: "", label: "All", color: "" },
  { id: "application", label: "Systems", color: "text-cyan-700 dark:text-cyan-300" },
  { id: "banking", label: "Banking Domain", color: "text-indigo-700 dark:text-indigo-300" },
  { id: "process", label: "Procedures", color: "text-emerald-700 dark:text-emerald-300" },
  { id: "tribal", label: "Team Resources", color: "text-amber-700 dark:text-amber-300" },
];

const DOMAIN_BADGE = {
  application:
    "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:border-cyan-900",
  banking:
    "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-900",
  process:
    "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900",
  tribal:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  general:
    "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700",
};

function ArticleCard({ article, onClick }) {
  const badge = DOMAIN_BADGE[article.domain] || DOMAIN_BADGE.general;
  return (
    <motion.button
      variants={itemVariants}
      onClick={() => onClick(article.id)}
      className="group w-full text-left p-4 sm:p-[1.125rem] app-card-interactive flex flex-col gap-3 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary ring-1 ring-primary/10">
            <ScrollText size={15} aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </p>
        </div>
        {article.is_pinned && <Star size={13} className="text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" />}
      </div>

      {article.summary && (
        <p className="text-xs text-secondary leading-relaxed line-clamp-2">{article.summary}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${badge}`}>
          {article.domain || "general"}
        </span>
        <ArrowRight
          size={13}
          className="text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      </div>
    </motion.button>
  );
}

function SearchResultCard({ result }) {
  const meta = result.metadata || {};
  const badge = DOMAIN_BADGE[meta.domain] || DOMAIN_BADGE.general;
  return (
    <div className="p-4 sm:p-[1.125rem] app-card flex flex-col gap-2.5 overflow-hidden">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-primary ring-1 ring-primary/10">
          <FileStack size={14} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            {meta.source_file || meta.file_name || meta.doc_id || "Knowledge source"}
          </p>
          <p className="text-xs text-secondary mt-1 leading-relaxed line-clamp-3">{result.snippet}</p>
        </div>
      </div>
      {meta.domain && (
        <span className={`self-start text-[11px] px-2 py-0.5 rounded-full font-medium border ${badge}`}>
          {meta.domain}
        </span>
      )}
    </div>
  );
}

function PdfUploadPanel() {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);

  const runUpload = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") {
      setMsg({ type: "err", text: "Please choose a PDF file." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await uploadPdf(file);
      const q = res.quality;
      const base = `${res.filename} uploaded (${Math.round(res.bytes / 1024)} KB).`;
      const tier = q?.tier ?? "ok";
      let type = "ok";
      if (tier === "fail") type = "warn";
      else if (tier === "warn") type = "warn";
      const lines = [base];
      if (q?.messages?.length) lines.push(...q.messages);
      if (q && tier !== "ok")
        lines.push(`Quality: ${q.extractable_chars} chars / ${q.page_count} page(s).`);
      const fullText = lines.join("\n\n");
      setMsg({ type, text: fullText });
      if (tier === "fail") notifyWarning(fullText, { duration: 8000 });
      else if (tier === "warn") notifyWarning(fullText, { duration: 6500 });
      else notifySuccess(base, { description: q?.messages?.length ? q.messages.join(" · ") : undefined });
    } catch (e) {
      const errText = parseApiError(e) || "Upload failed.";
      setMsg({ type: "err", text: errText });
      notifyApiError(e, errText);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, []);

  return (
    <div className="app-card p-5 mb-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/15">
          <FolderUp size={18} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Upload size={14} className="text-primary" aria-hidden="true" />
            Upload Documentation
          </h2>
          <p className="text-xs text-secondary mt-0.5 leading-relaxed max-w-xl">
            Approved documents are stored securely. Visit the <strong className="text-foreground">Admin Console</strong> to refresh the search index after uploading new material.
          </p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) runUpload(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all
          ${drag ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/40 hover:bg-surface-hover"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) runUpload(f);
          }}
        />
        {busy ? (
          <Loader2 className="mx-auto portal-animate-spin text-primary" size={26} aria-hidden="true" />
        ) : (
          <Sparkles className="mx-auto text-primary/70 mb-2" size={22} aria-hidden="true" />
        )}
        <p className="text-sm font-medium text-foreground">{busy ? "Uploading…" : "Drop PDF here or click to browse"}</p>
        <p className="text-[11px] text-secondary mt-1">Max size follows server policy (typically 10 MB).</p>
      </div>

      {msg && (
        <div
          className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 border whitespace-pre-wrap ${
            msg.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300"
              : msg.type === "warn"
                ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/25 dark:border-amber-800 dark:text-amber-200"
                : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300"
          }`}
        >
          {msg.type === "ok" ? (
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/portal/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <LayoutDashboard size={13} aria-hidden="true" />
          Admin console
        </Link>
      </div>
    </div>
  );
}

export default function KnowledgeHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const admin = isAdmin(user);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const [domain, setDomain] = useState(searchParams.get("domain") || "");

  useEffect(() => {
    // Synchronize URL search params with local state
    const next = {};
    if (domain) next.domain = domain;
    if (query && searchResults) next.q = query;
    
    // Only update if something actually changed to avoid infinite loops
    const currentDomain = searchParams.get("domain") || "";
    const currentQ = searchParams.get("q") || "";
    
    if (domain !== currentDomain || (query && searchResults && query !== currentQ)) {
      setSearchParams(next, { replace: true });
    }
  }, [domain, query, searchResults, searchParams, setSearchParams]);

  useEffect(() => {
    // Trigger initial search if 'q' is present in URL on mount
    const q = searchParams.get("q");
    if (q && !searchResults && !searching) {
      setSearching(true);
      search(q, domain ? { domain } : {}, 12, domain || null)
        .then(setSearchResults)
        .catch(() => setSearchResults({ results: [], count: 0, query: q }))
        .finally(() => setSearching(false));
    }
  }, []); // Run once on mount
  const [articles, setArticles] = useState([]);
  const [articlesPage, setArticlesPage] = useState(1);
  const [articlesTotal, setArticlesTotal] = useState(0);
  const [loadingArticles, setLoadingArticles] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingArticles(true);
    const params = {
      status: "published",
      limit: HUB_ARTICLES_PAGE_SIZE,
      offset: (articlesPage - 1) * HUB_ARTICLES_PAGE_SIZE,
    };
    if (domain) params.domain = domain;
    listArticles(params)
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        const t = typeof res.total === "number" ? res.total : items.length;
        if (items.length === 0 && t > 0 && articlesPage > 1) {
          setArticlesPage(1);
          return;
        }
        setArticles(items);
        setArticlesTotal(t);
      })
      .catch(() => {
        if (!cancelled) {
          setArticles([]);
          setArticlesTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingArticles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain, articlesPage]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await search(query, domain ? { domain } : {}, 12, domain || null);
      setSearchResults(res);
    } catch (err) {
      notifyApiError(err, "Search failed.");
      setSearchResults({ results: [], count: 0, query });
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
    setQuery("");
  };

  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <motion.div
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <Helmet>
        <title>{`Knowledge Hub — ${BRAND.name}`}</title>
        <meta name="description" content="Search and browse internal banking knowledge, SOPs, and documentation." />
      </Helmet>

      <PortalBannerStack />

      <header className="mb-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-secondary">
            <Library size={12} className="text-primary shrink-0" aria-hidden="true" />
            Knowledge hub
          </div>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Knowledge hub shortcuts">
            <Link
              to="/portal/knowledge/bookmarks"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/8 transition-colors"
            >
              <Bookmark size={14} className="shrink-0" aria-hidden="true" />
              Bookmarks
            </Link>
            {admin && (
              <Link
                to="/portal/admin"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-surface-hover transition-colors shadow-sm"
              >
                <LayoutDashboard size={14} className="text-primary shrink-0" aria-hidden="true" />
                Admin console
              </Link>
            )}
          </nav>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground tracking-tight">Hello, {firstName}</h1>
          <p className="text-sm text-secondary mt-2 max-w-xl leading-relaxed">
            Search and browse official articles; the assistant provides answers based on verified internal documentation.
          </p>
        </div>
      </header>

      {admin && <PdfUploadPanel />}

      <form onSubmit={handleSearch} className="mb-5 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “SWIFT cut-off”, “KYC tiering”, “card dispute SLA”…"
            className="w-full pl-11 pr-4 py-3 text-sm rounded-xl border border-border bg-surface text-foreground placeholder-secondary/80 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-3 rounded-xl border border-border bg-surface text-secondary hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-6 py-3 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {searching ? <Loader2 size={15} className="portal-animate-spin" /> : <Search size={15} />}
            Search
          </button>
        </div>
      </form>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {DOMAINS.map((d) => (
          <button
            key={d.id || "all"}
            type="button"
            onClick={() => {
              setDomain(d.id);
              setArticlesPage(1);
              setSearchResults(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all
              ${
                domain === d.id
                  ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                  : `border-border text-secondary hover:text-foreground hover:border-primary/30 ${d.color}`
              }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {searchResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileStack size={15} className="text-primary" />
              {searchResults.count} result{searchResults.count !== 1 ? "s" : ""}{" "}
              <span className="font-normal text-secondary">for</span>{" "}
              <span className="text-primary">"{searchResults.query}"</span>
            </p>
            <button type="button" onClick={clearSearch} className="text-xs text-secondary hover:text-foreground transition-colors">
              Clear
            </button>
          </div>

          {searchResults.count === 0 ? (
            <div className="py-14 text-center app-card">
              <Search size={26} className="mx-auto text-secondary mb-2 opacity-40" />
              <p className="text-sm text-secondary">No results found.</p>
              <p className="text-xs text-secondary/70 mt-1">Try a broader term or switch domain filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {searchResults.results.map((r) => (
                <SearchResultCard key={r.id} result={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {searching && !searchResults && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">Searching…</p>
          <SearchGridSkeleton count={4} />
        </div>
      )}

      {!searchResults && !searching && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider flex items-center gap-2">
              <FileText size={13} className="text-primary" />
              {domain ? DOMAINS.find((d) => d.id === domain)?.label : "All articles"}
              {!loadingArticles && articlesTotal > 0 && ` · ${articlesTotal} published`}
            </p>
          </div>

          {loadingArticles ? (
            <ArticleGridSkeleton count={6} />
          ) : articles.length === 0 ? (
            <div className="py-16 text-center app-card border-dashed">
              <Library size={30} className="mx-auto text-secondary mb-2.5 opacity-35" />
              <p className="text-sm text-secondary">No published articles yet.</p>
              <p className="text-xs text-secondary/70 mt-1 max-w-sm mx-auto">
                Admins: upload PDFs above (then reindex) or add articles in Admin Console.
              </p>
            </div>
          ) : (
            <PaginationBar
              bothEnds
              page={articlesPage}
              pageSize={HUB_ARTICLES_PAGE_SIZE}
              total={articlesTotal}
              onPageChange={setArticlesPage}
              idPrefix="hub-articles"
            >
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {articles.map((a) => (
                  <ArticleCard key={a.id} article={a} onClick={(id) => navigate(`/portal/knowledge/articles/${id}`)} />
                ))}
              </motion.div>
            </PaginationBar>
          )}
        </div>
      )}
    </motion.div>
  );
}
