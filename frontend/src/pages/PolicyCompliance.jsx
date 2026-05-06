import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listArticles } from "../api/client";
import { Shield, ArrowRight, Loader2, AlertCircle, Calendar } from "lucide-react";

export default function PolicyCompliance() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listArticles({ domain: "banking", status: "published", limit: 100 })
      .then((res) => setArticles(res.items || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const expiringArticles = articles.filter((a) => {
    if (!a.expires_at) return false;
    const diff = (new Date(a.expires_at) - now) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff > 0;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Policy & Compliance</h1>
        <p className="text-secondary text-sm mt-0.5">KYC/AML and related policy articles</p>
      </div>

      {/* Expiring soon alert */}
      {expiringArticles.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {expiringArticles.length} policy document{expiringArticles.length > 1 ? "s" : ""} expiring soon
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Review within 30 days with Compliance.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="portal-animate-spin text-secondary" />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Shield size={32} className="text-secondary mb-3" />
          <p className="text-sm font-medium text-foreground">No compliance documents yet</p>
          <p className="text-xs text-secondary mt-1">Compliance team can add regulatory documents via the Admin Console.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => {
            const isExpiring = expiringArticles.some((e) => e.id === article.id);
            return (
              <button
                key={article.id}
                onClick={() => navigate(`/portal/knowledge/articles/${article.id}`)}
                className={`w-full text-left p-4 rounded-lg border transition-all group
                  ${isExpiring
                    ? "border-amber-200 dark:border-amber-800 hover:border-amber-400"
                    : "border-border hover:border-primary/40"
                  } bg-surface`}
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
                      {article.expires_at && (
                        <span className={`flex items-center gap-1 text-xs ${isExpiring ? "text-amber-600 dark:text-amber-400" : "text-secondary"}`}>
                          <Calendar size={11} />
                          Expires {new Date(article.expires_at).toLocaleDateString()}
                          {isExpiring && " — Expiring soon"}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-secondary mt-1 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
