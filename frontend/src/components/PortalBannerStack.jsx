import { useState, useEffect } from "react";
import { Megaphone, Sparkles, X } from "lucide-react";

const STORAGE_PREFIX = "stratum-banner-dismissed:";

const BANNERS = [
  {
    id: "governance",
    variant: "info",
    icon: Megaphone,
    title: "Governed knowledge",
    body: "Not legal or regulatory advice — confirm with policy owners before customer-impacting decisions.",
  },
  {
    id: "copilot",
    variant: "accent",
    icon: Sparkles,
    title: "Copilot + citations",
    body: "Prefer answers that link to internal docs you can open and check.",
  },
];

function variantClasses(variant) {
  if (variant === "accent") {
    return "border-primary/25 bg-gradient-to-r from-primary/10 via-surface to-indigo-500/10 dark:from-primary/15 dark:to-indigo-500/10";
  }
  return "border-border bg-surface/90 dark:bg-slate-900/60";
}

export default function PortalBannerStack() {
  const [dismissed, setDismissed] = useState(() => new Set());

  useEffect(() => {
    const next = new Set();
    BANNERS.forEach((b) => {
      try {
        if (localStorage.getItem(STORAGE_PREFIX + b.id)) next.add(b.id);
      } catch {
        /* ignore */
      }
    });
    setDismissed(next);
  }, []);

  const dismiss = (id) => {
    try {
      localStorage.setItem(STORAGE_PREFIX + id, "1");
    } catch {
      /* ignore */
    }
    setDismissed((d) => new Set([...d, id]));
  };

  const visible = BANNERS.filter((b) => !dismissed.has(b.id));
  if (!visible.length) return null;

  return (
    <div className="space-y-3 mb-6 no-print" role="region" aria-label="Announcements">
      {visible.map((b) => {
        const Icon = b.icon;
        return (
          <div
            key={b.id}
            className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 sm:px-5 sm:py-4 shadow-sm ${variantClasses(b.variant)}`}
          >
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" aria-hidden="true" />
            <div className="flex gap-3 pr-8">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary ring-1 ring-primary/20">
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{b.title}</p>
                <p className="text-xs text-secondary mt-1 leading-relaxed">{b.body}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label={`Dismiss ${b.title}`}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
