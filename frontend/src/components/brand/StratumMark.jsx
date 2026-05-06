import { useId } from "react";

/**
 * Stratum brand mark — stacked “strata” with sky→violet gradient.
 * Variants: tile (app icon), inverse (gradient mark only — for dark hero panels),
 * knockout (white on primary), minimal (currentColor lines + node).
 */
export default function StratumMark({
  size = 32,
  variant = "tile",
  className = "",
  /** Accessible name; omit when `decorative` */
  title = "Stratum",
  /** Hide from assistive tech (e.g. next to visible wordmark) */
  decorative = false,
}) {
  const id = useId().replace(/:/g, "");
  const gStrata = `sm-strata-${id}`;
  const gBg = `sm-bg-${id}`;
  const gShine = `sm-shine-${id}`;

  const strokeStrata =
    variant === "knockout"
      ? "white"
      : variant === "minimal"
        ? "currentColor"
        : `url(#${gStrata})`;

  const nodeFill =
    variant === "knockout"
      ? "white"
      : variant === "minimal"
        ? "currentColor"
        : `url(#${gStrata})`;

  const showBg = variant === "tile";
  const showGlow = variant === "tile";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative ? true : undefined}
    >
      {!decorative && title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gStrata} x1="4" y1="16" x2="28" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id={gBg} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0c1322" />
          <stop offset="0.45" stopColor="#111827" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id={gShine} x1="6" y1="4" x2="20" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {showBg ? (
        <>
          <rect width="32" height="32" rx="9" fill={`url(#${gBg})`} />
          <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="white" strokeOpacity="0.1" />
          {showGlow ? (
            <path
              d="M9 7.5c3.5-1.2 10.5-1.2 14 0"
              stroke={`url(#${gShine})`}
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : null}
        </>
      ) : null}

      {/* Stacked strata — slight stagger for depth */}
      <path
        d="M7 12.5h14.5"
        stroke={strokeStrata}
        strokeWidth="2.35"
        strokeLinecap="round"
        opacity={variant === "knockout" ? 1 : 0.95}
      />
      <path
        d="M6 16.5h20"
        stroke={strokeStrata}
        strokeWidth="2.35"
        strokeLinecap="round"
      />
      <path
        d="M8 20.5h12"
        stroke={strokeStrata}
        strokeWidth="2.35"
        strokeLinecap="round"
        opacity={variant === "knockout" ? 0.92 : 0.88}
      />

      {/* Knowledge node */}
      <circle
        cx="24.5"
        cy="11.5"
        r="2.35"
        fill={nodeFill}
        opacity={variant === "minimal" ? 0.85 : 1}
      />
    </svg>
  );
}
