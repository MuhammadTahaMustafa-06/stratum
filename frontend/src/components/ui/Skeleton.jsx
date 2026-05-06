/**
 * Shimmer skeleton primitives for loading states.
 */
export function Skeleton({ className = "", ...rest }) {
  return <div className={`skeleton-shimmer rounded-md ${className}`} {...rest} />;
}

export function ArticleCardSkeleton() {
  return (
    <div className="app-card p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-7 w-7 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex justify-between pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-4 rounded" />
      </div>
    </div>
  );
}

export function ArticleGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function SearchResultSkeleton() {
  return (
    <div className="app-card p-4 flex gap-3">
      <Skeleton className="h-7 w-7 rounded-lg flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-3/5 max-w-[200px]" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-5 w-20 rounded-full mt-1" />
      </div>
    </div>
  );
}

export function SearchGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
    </div>
  );
}

export function ArticleDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-4/5 max-w-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

/** Full-area spinner with optional copy — use on route-level / tab loads. */
export function PageSpinner({ title = "Loading…", subtitle }) {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 px-4">
      <div className="relative h-11 w-11" aria-hidden>
        <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/40 portal-animate-spin" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle ? <p className="text-xs text-secondary max-w-xs leading-relaxed">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/** Inline spinner for buttons and compact rows (inherits current text color unless overridden). */
export function InlineSpinner({ className = "text-current", size = 14 }) {
  return (
    <svg
      className={`portal-animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
