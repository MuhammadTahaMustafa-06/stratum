import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listArticles } from "../api/client";
import { FileText, Search, ArrowRight, Loader2, Tag } from "lucide-react";
import { PaginationBar } from "../components/ui/PaginationBar";

const PAGE_SIZE = 12;

const DOMAINS = [
  { id: "", label: "All" },
  { id: "application", label: "Applications" },
  { id: "banking", label: "Banking Domain" },
  { id: "process", label: "Processes" },
  { id: "tribal", label: "Team Knowledge" },
];

const DOMAIN_COLORS = {
  application: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  banking: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  process: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  tribal: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  general: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function ArticleBrowser() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const q = searchParams.get("q") || "";
  const domain = searchParams.get("domain") || "";
  const status = "published";
  const page = Math.max(1, parseInt(String(searchParams.get("page") || "1"), 10) || 1);

  const syncParams = useCallback(
    (next) => {
      const p = new URLSearchParams();
      if (next.q) p.set("q", next.q);
      if (next.domain) p.set("domain", next.domain);
      if (next.page > 1) p.set("page", String(next.page));
      setSearchParams(p, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    const params = { status, limit: PAGE_SIZE, offset };
    if (q) params.q = q;
    if (domain) params.domain = domain;
    listArticles(params)
      .then((res) => {
        const items = res.items || [];
        const t = typeof res.total === "number" ? res.total : items.length;
        if (items.length === 0 && t > 0 && page > 1) {
          syncParams({ q, domain, page: 1 });
          return;
        }
        setArticles(items);
        setTotal(t);
      })
      .catch(() => {
        setArticles([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [q, domain, status, page, syncParams]);

  const handleSearch = (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const newQ = form.get("q") || "";
    syncParams({ q: newQ, domain, page: 1 });
  };

  const setPage = (nextPage) => {
    syncParams({ q, domain, page: nextPage });
  };

  const selectDomain = (nextDomain) => {
    syncParams({ q, domain: nextDomain, page: 1 });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Knowledge Articles</h1>
          <p className="text-secondary text-sm mt-0.5">Published articles</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <form onSubmit={handleSearch} className="flex w-full gap-2 sm:flex-1 sm:min-w-[200px]">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              key={q}
              name="q"
              defaultValue={q}
              placeholder="Search articles..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button type="submit" className="px-3 py-2 text-sm rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors">
            <Search size={14} />
          </button>
        </form>

        {/* Domain pills */}
        <div className="flex gap-1.5 flex-wrap">
          {DOMAINS.map((d) => (
            <button
              key={d.id}
              onClick={() => selectDomain(d.id)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors
                ${domain === d.id
                  ? "bg-primary text-white border-primary"
                  : "border-border text-secondary hover:text-foreground hover:border-primary/40"
                }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="portal-animate-spin text-secondary" />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={32} className="text-secondary mb-3" />
          <p className="text-sm font-medium text-foreground">No articles found</p>
          <p className="text-xs text-secondary mt-1">Try a different search or domain filter</p>
        </div>
      ) : (
        <PaginationBar
          bothEnds
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          idPrefix="articles-browser"
        >
          <div className="space-y-2">
            {articles.map((article) => {
              const color = DOMAIN_COLORS[article.domain] || DOMAIN_COLORS.general;
              return (
                <button
                  key={article.id}
                  onClick={() => navigate(`/portal/knowledge/articles/${article.id}`)}
                  className="w-full min-w-0 text-left p-4 rounded-lg border border-border bg-surface hover:border-primary/40 hover:shadow-sm transition-all group overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 break-words">
                        {article.title}
                      </p>
                      {article.summary && (
                        <p className="text-xs text-secondary mt-1 line-clamp-2 leading-relaxed break-words">
                          {article.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
                          {article.domain}
                        </span>
                        {article.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="inline-flex min-w-0 items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-hover text-secondary border border-border">
                            <Tag size={9} />{tag}
                          </span>
                        ))}
                        {article.system_name && (
                          <span className="text-xs text-secondary break-all">{article.system_name}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-secondary mt-1 flex-shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </PaginationBar>
      )}
    </div>
  );
}
