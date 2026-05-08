import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listLearningPaths, enrollInPath } from "../api/client";
import { GraduationCap, Clock, ArrowRight, Loader2, CheckCircle, BookOpen } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { canManageContent, getAdminSurfaceLabel } from "../lib/roles";

const DIFFICULTY_COLORS = {
  beginner: "text-green-600 dark:text-green-400",
  intermediate: "text-amber-600 dark:text-amber-400",
  advanced: "text-red-600 dark:text-red-400",
};

function PathCard({ path, onEnroll, enrolling }) {
  const navigate = useNavigate();
  const diffColor = DIFFICULTY_COLORS[path.difficulty] || "text-secondary";
  return (
    <div className="p-4 sm:p-5 rounded-lg border border-border bg-surface hover:border-primary/40 transition-all overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {path.is_onboarding && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                Onboarding
              </span>
            )}
            <span className={`text-xs font-medium ${diffColor}`}>
              {path.difficulty}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug break-words">{path.title}</h3>
          {path.description && (
            <p className="text-xs text-secondary mt-1 leading-relaxed line-clamp-2">
              {path.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-secondary min-w-0">
          <BookOpen size={12} /> {path.item_count} items
        </span>
        {path.estimated_hours && (
          <span className="flex items-center gap-1.5 text-xs text-secondary min-w-0">
            <Clock size={12} /> {path.estimated_hours}h
          </span>
        )}
        {path.target_role && (
          <span className="text-xs text-secondary min-w-0 break-words">For: {path.target_role.replace("_", " ")}</span>
        )}
      </div>

      {/* Progress bar */}
      {path.enrolled && path.progress_pct !== undefined && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-secondary mb-1">
            <span>Progress</span>
            <span>{path.progress_pct}%</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${path.progress_pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => navigate(`/portal/learning/${path.id}`)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-surface-hover transition-colors"
        >
          View Path <ArrowRight size={12} />
        </button>
        {!path.enrolled && (
          <button
            onClick={() => onEnroll(path.id)}
            disabled={enrolling === path.id}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {enrolling === path.id ? (
              <Loader2 size={12} className="portal-animate-spin" />
            ) : (
              <CheckCircle size={12} />
            )}
            Enroll
          </button>
        )}
      </div>
    </div>
  );
}

export default function LearningPaths() {
  const { user } = useAuth();
  const adminSurfaceLabel = getAdminSurfaceLabel(user);
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null);

  useEffect(() => {
    listLearningPaths()
      .then((res) => setPaths(res.items || []))
      .catch(() => setPaths([]))
      .finally(() => setLoading(false));
  }, []);

  const handleEnroll = async (pathId) => {
    setEnrolling(pathId);
    try {
      await enrollInPath(pathId);
      setPaths((prev) => prev.map((p) => p.id === pathId ? { ...p, enrolled: true, progress_pct: 0 } : p));
    } finally {
      setEnrolling(null);
    }
  };

  const onboardingPaths = paths.filter((p) => p.is_onboarding);
  const otherPaths = paths.filter((p) => !p.is_onboarding);
  const myPaths = paths.filter((p) => p.enrolled);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={22} className="portal-animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Learning Paths</h1>
        <p className="text-secondary text-sm mt-1">
          Sequences for onboarding and domain topics.
        </p>
      </div>

      {paths.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GraduationCap size={36} className="text-secondary mb-4" />
          <p className="text-sm font-medium text-foreground">No learning paths yet</p>
          <p className="text-xs text-secondary mt-1">
            {canManageContent(user) ? `Create paths in ${adminSurfaceLabel}.` : "No learning paths are available yet."}
          </p>
        </div>
      ) : (
        <>
          {myPaths.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-foreground mb-3">In Progress</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myPaths.map((p) => (
                  <PathCard key={p.id} path={p} onEnroll={handleEnroll} enrolling={enrolling} />
                ))}
              </div>
            </div>
          )}

          {onboardingPaths.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-foreground mb-3">Onboarding</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {onboardingPaths.map((p) => (
                  <PathCard key={p.id} path={p} onEnroll={handleEnroll} enrolling={enrolling} />
                ))}
              </div>
            </div>
          )}

          {otherPaths.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">All Paths</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {otherPaths.map((p) => (
                  <PathCard key={p.id} path={p} onEnroll={handleEnroll} enrolling={enrolling} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
