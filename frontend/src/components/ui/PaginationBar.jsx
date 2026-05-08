import { ChevronLeft, ChevronRight } from "lucide-react";
import PropTypes from "prop-types";

function PaginationBarRow({
  page,
  pageSize,
  total,
  onPageChange,
  className = "",
  idPrefix = "pagination",
  placement = "single",
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const placementClass =
    placement === "top"
      ? "border-b border-border pb-4 mb-2"
      : placement === "bottom"
        ? "border-t border-border pt-4 mt-2"
        : "pt-4";

  const btnClass =
    "inline-flex items-center justify-center gap-1.5 rounded-xl min-h-10 px-3 text-sm font-semibold transition-all sm:px-4 " +
    "border-2 border-border bg-surface text-foreground shadow-sm " +
    "hover:border-primary/45 hover:bg-primary/5 hover:text-primary " +
    "disabled:opacity-35 disabled:pointer-events-none disabled:shadow-none disabled:hover:border-border disabled:hover:bg-surface disabled:hover:text-foreground";

  return (
    <nav
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${placementClass} ${className}`}
      aria-label={placement === "top" ? "Pagination (top)" : "Pagination"}
    >
      <p className="text-center text-xs text-secondary tabular-nums order-2 sm:order-1 sm:text-left">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{from}</span>
            –
            <span className="font-medium text-foreground">{to}</span>
            {" of "}
            <span className="font-medium text-foreground">{total}</span>
          </>
        )}
      </p>
      <div className="flex w-full flex-wrap items-center justify-center gap-2 order-1 sm:w-auto sm:justify-end sm:order-2">
        <button
          type="button"
          id={`${idPrefix}-${placement}-prev`}
          disabled={safePage <= 1 || total === 0}
          onClick={() => onPageChange(safePage - 1)}
          className={btnClass}
        >
          <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
          <span className="hidden min-[360px]:inline">Previous</span>
        </button>
        <span className="text-xs font-medium text-secondary tabular-nums px-1 min-w-[4.75rem] text-center sm:px-2 sm:min-w-[6rem]">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          id={`${idPrefix}-${placement}-next`}
          disabled={safePage >= totalPages || total === 0}
          onClick={() => onPageChange(safePage + 1)}
          className={btnClass}
        >
          <span className="hidden min-[360px]:inline">Next</span>
          <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Previous / next + range text for offset/limit style APIs.
 * `page` is 1-based; `total` is full result count for current filters.
 *
 * @param {boolean} [bothEnds] — When true and there is more than one page: render controls above and below
 *   `children`. Pass `children` to wrap a list/grid; if `bothEnds` is true and `children` is omitted, both
 *   control rows render stacked (footer-only layouts).
 */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  className = "",
  idPrefix = "pagination",
  bothEnds = false,
  children = null,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const duplicate = Boolean(bothEnds && total > 0 && totalPages > 1);

  if (duplicate) {
    return (
      <>
        <PaginationBarRow
          placement="top"
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          className={className}
          idPrefix={idPrefix}
        />
        {children}
        <PaginationBarRow
          placement="bottom"
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          className={className}
          idPrefix={idPrefix}
        />
      </>
    );
  }

  return (
    <>
      {children}
      <PaginationBarRow
        placement="single"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        className={className}
        idPrefix={idPrefix}
      />
    </>
  );
}

PaginationBar.propTypes = {
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  idPrefix: PropTypes.string,
  bothEnds: PropTypes.bool,
  children: PropTypes.node,
};

PaginationBarRow.propTypes = {
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  idPrefix: PropTypes.string,
  placement: PropTypes.oneOf(["top", "bottom", "single"]),
};
