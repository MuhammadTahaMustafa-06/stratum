import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Bookmark, ArrowRight, Trash2, Loader2, Library } from "lucide-react";
import { listBookmarks, removeBookmark } from "../api/client";
import { BRAND } from "../lib/brand";
import { notifyApiError, notifySuccess } from "../lib/notify";
import PortalBannerStack from "../components/PortalBannerStack";

const pageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function Bookmarks() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    listBookmarks()
      .then((res) => setItems(res.items || []))
      .catch((e) => {
        notifyApiError(e, "Could not load bookmarks.");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = async (articleId) => {
    setRemoving(articleId);
    try {
      await removeBookmark(articleId);
      setItems((prev) => prev.filter((b) => b.article_id !== articleId));
      notifySuccess("Removed from bookmarks.");
    } catch (e) {
      notifyApiError(e, "Could not remove bookmark.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <motion.div
      className="max-w-3xl mx-auto px-6 py-8"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <Helmet>
        <title>{`Bookmarks — ${BRAND.name}`}</title>
      </Helmet>
      <PortalBannerStack />

      <header className="mb-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-secondary">
            <Bookmark size={12} className="text-primary shrink-0" aria-hidden="true" />
            Saved articles
          </div>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground tracking-tight">Bookmarks</h1>
          <p className="text-sm text-secondary mt-2 max-w-xl leading-relaxed">
            Articles you saved for quick access. Removing one here only clears your bookmark — it does not delete the article.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="portal-animate-spin text-primary" size={28} aria-hidden="true" />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card p-8 text-center border-dashed">
          <Library className="mx-auto text-secondary mb-3 opacity-40" size={32} aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No bookmarks yet</p>
          <p className="text-xs text-secondary mt-1.5 max-w-sm mx-auto">
            Open an article and use <strong className="text-foreground">Save</strong> in the toolbar to add it here.
          </p>
          <Link
            to="/portal/knowledge"
            className="inline-flex items-center gap-1.5 mt-5 text-sm font-semibold text-primary hover:underline"
          >
            Browse knowledge hub <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li
              key={b.id}
              className="app-card flex items-stretch gap-3 p-4 group border-border hover:border-primary/25 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/portal/knowledge/articles/${b.article_id}`}
                  className="text-sm font-semibold text-foreground hover:text-primary transition-colors line-clamp-2"
                >
                  {b.article_title || "Article"}
                </Link>
                {b.article_domain && (
                  <p className="text-[11px] text-secondary mt-1 capitalize">{b.article_domain}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link
                  to={`/portal/knowledge/articles/${b.article_id}`}
                  className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
                  aria-label="Open article"
                >
                  <ArrowRight size={18} />
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(b.article_id)}
                  disabled={removing === b.article_id}
                  className="p-2 rounded-lg text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  aria-label="Remove bookmark"
                >
                  {removing === b.article_id ? (
                    <Loader2 size={18} className="portal-animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
