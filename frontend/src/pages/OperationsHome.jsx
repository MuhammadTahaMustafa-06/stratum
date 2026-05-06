import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listArticles } from "../api/client";
import { Wrench, ArrowRight, Loader2, CheckCircle, Clock, AlertTriangle } from "lucide-react";

const PROCESS_TYPES = [
  { id: "", label: "All" },
  { id: "runbook", label: "Runbooks" },
  { id: "incident", label: "Incident Playbooks" },
  { id: "sop", label: "SOPs" },
  { id: "release", label: "Release Notes" },
];

export default function OperationsHome() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processType, setProcessType] = useState("");

  useEffect(() => {
    setLoading(true);
    listArticles({ domain: "process", status: "published", limit: 50 })
      .then((res) => setArticles(res.items || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = processType
    ? articles.filter((a) => (a.process_type || "").toLowerCase() === processType)
    : articles;

  // Also show in_review articles for eligible roles
  const inReview = articles.filter((a) => a.status === "in_review");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Operations Knowledge</h1>
        <p className="text-secondary text-sm mt-0.5">Runbooks, playbooks, and SOPs</p>
      </div>

      {/* Process type filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {PROCESS_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setProcessType(t.id)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors
              ${processType === t.id
                ? "bg-primary text-white border-primary"
                : "border-border text-secondary hover:text-foreground"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="portal-animate-spin text-secondary" />
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Wrench size={32} className="text-secondary mb-3" />
              <p className="text-sm font-medium text-foreground">No operational articles found</p>
              <p className="text-xs text-secondary mt-1">Add runbooks and SOPs through the Admin Console.</p>
            </div>
          ) : (
            <div className="space-y-2 mb-8">
              {filtered.map((article) => (
                <button
                  key={article.id}
                  onClick={() => navigate(`/portal/knowledge/articles/${article.id}`)}
                  className="w-full text-left p-4 rounded-lg border border-border bg-surface hover:border-primary/40 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {article.title}
                      </p>
                      {article.summary && (
                        <p className="text-xs text-secondary mt-1 line-clamp-1">{article.summary}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {article.process_type && (
                          <span className="text-xs text-secondary capitalize">{article.process_type}</span>
                        )}
                        {article.system_name && (
                          <span className="text-xs text-secondary">{article.system_name}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-secondary mt-1 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* In Review queue */}
          {inReview.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock size={14} className="text-amber-500" /> Pending Review ({inReview.length})
              </h2>
              <div className="space-y-2">
                {inReview.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 flex items-center justify-between">
                    <p className="text-sm text-foreground">{a.title}</p>
                    <span className="text-xs text-amber-600 dark:text-amber-400">In Review</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
