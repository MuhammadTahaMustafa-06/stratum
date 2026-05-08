import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getLearningPath, enrollInPath, updateProgress } from "../api/client";
import { ArrowLeft, CheckCircle, Circle, BookOpen, ExternalLink, Loader2, Clock } from "lucide-react";

export default function LearningPathDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);

  useEffect(() => {
    getLearningPath(id)
      .then(setPath)
      .catch(() => setPath(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enrollInPath(id);
      setPath((p) => ({ ...p, enrolled: true, progress_pct: 0 }));
    } finally {
      setEnrolling(false);
    }
  };

  const handleToggleItem = async (item) => {
    if (!path?.enrolled) return;
    setUpdatingItem(item.id);
    const newCompleted = !item.completed;
    try {
      await updateProgress(id, item.id, newCompleted);
      const updatedItems = path.items.map((i) =>
        i.id === item.id ? { ...i, completed: newCompleted } : i
      );
      const completedCount = updatedItems.filter((i) => i.completed).length;
      const progress_pct = path.items.length ? Math.round((completedCount / path.items.length) * 100) : 0;
      setPath((p) => ({ ...p, items: updatedItems, progress_pct }));
    } finally {
      setUpdatingItem(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={22} className="portal-animate-spin text-secondary" />
      </div>
    );
  }

  if (!path) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-center">
        <p className="text-sm text-secondary">Learning path not found.</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-xs text-primary hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-xs text-secondary hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft size={14} /> Learning Paths
      </button>

      {/* Header */}
      <div className="mb-6 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {path.is_onboarding && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">Onboarding</span>
          )}
          <span className="text-xs text-secondary capitalize">{path.difficulty}</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground break-words">{path.title}</h1>
        {path.description && <p className="text-secondary text-sm mt-2 break-words">{path.description}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-secondary">
            <BookOpen size={12} /> {path.item_count} items
          </span>
          {path.estimated_hours && (
            <span className="flex items-center gap-1.5 text-xs text-secondary">
              <Clock size={12} /> ~{path.estimated_hours}h
            </span>
          )}
          {path.target_role && (
            <span className="text-xs text-secondary min-w-0 break-words">For: {path.target_role.replace("_", " ")}</span>
          )}
        </div>
      </div>

      {/* Progress */}
      {path.enrolled && (
        <div className="mb-6 p-4 rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Your Progress</span>
            <span className="text-sm font-semibold text-primary">{path.progress_pct || 0}%</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${path.progress_pct || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Enroll */}
      {!path.enrolled && (
        <div className="mb-6">
          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="w-full px-6 py-2.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 sm:w-auto"
          >
            {enrolling ? <Loader2 size={15} className="portal-animate-spin" /> : <CheckCircle size={15} />}
            Enroll in this path
          </button>
        </div>
      )}

      <div className="h-px bg-border mb-6" />

      {/* Items */}
      <div className="space-y-3">
        {(path.items || []).map((item, idx) => (
          <div
            key={item.id}
            className={`p-4 rounded-lg border transition-all overflow-hidden ${
              item.completed ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10" : "border-border bg-surface"
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => handleToggleItem(item)}
                disabled={!path.enrolled || updatingItem === item.id}
                className="mt-0.5 flex-shrink-0 text-secondary hover:text-primary disabled:cursor-default transition-colors"
              >
                {updatingItem === item.id ? (
                  <Loader2 size={18} className="portal-animate-spin" />
                ) : item.completed ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : (
                  <Circle size={18} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                  <p className={`text-sm font-medium min-w-0 break-words ${item.completed ? "line-through text-secondary" : "text-foreground"}`}>
                    <span className="text-xs text-secondary mr-2">{idx + 1}.</span>
                    {item.title}
                  </p>
                  {!item.is_required && (
                    <span className="text-xs text-secondary flex-shrink-0 self-start">Optional</span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-secondary mt-1 leading-relaxed break-words">{item.description}</p>
                )}
                {item.article_id && (
                  <button
                    onClick={() => navigate(`/portal/knowledge/articles/${item.article_id}`)}
                    className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <BookOpen size={11} /> View article
                  </button>
                )}
                {item.resource_url && (
                  <a
                    href={item.resource_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline break-all"
                  >
                    <ExternalLink size={11} /> Open resource
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
