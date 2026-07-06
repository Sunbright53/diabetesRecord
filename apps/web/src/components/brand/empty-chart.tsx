import { twMerge } from "tailwind-merge";

// Custom empty-state illustration for charts (no data yet)
export function EmptyChartIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twMerge("text-mint-300", className)}
    >
      <path d="M8 62 L36 42 L58 52 L82 28 L112 44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 4" />
      <circle cx="36"  cy="42" r="2.5" fill="currentColor" opacity="0.45" />
      <circle cx="58"  cy="52" r="2.5" fill="currentColor" opacity="0.45" />
      <circle cx="82"  cy="28" r="2.5" fill="currentColor" opacity="0.45" />
      <path d="M8 70 L112 70" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
      <path d="M20 74 L100 74" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.2" />
    </svg>
  );
}
