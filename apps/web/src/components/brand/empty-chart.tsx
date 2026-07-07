import { twMerge } from "tailwind-merge";

export function EmptyChartIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twMerge("text-border-strong", className)}
    >
      {/* Bar chart empty state — clearly bars, not a line chart */}
      <rect x="12" y="50" width="14" height="20" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="32" y="38" width="14" height="32" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="52" y="44" width="14" height="26" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="72" y="30" width="14" height="40" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="92" y="42" width="14" height="28" rx="3" fill="currentColor" opacity="0.2" />
      {/* X-axis */}
      <line x1="8" y1="70" x2="112" y2="70" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      {/* No data icon */}
      <circle cx="60" cy="26" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <line x1="55" y1="22" x2="65" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
