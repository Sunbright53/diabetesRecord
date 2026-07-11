"use client";

import { useMemo } from "react";
import { formatAcetone, unitLabel, useUnits } from "@/lib/units";

interface Props {
  value: number | null;
  label: string | null;
  size?: number;
}

const LABEL_CONFIG: Record<string, { color: string; grad: [string, string] }> = {
  clean:      { color: "#38BDF8", grad: ["#38BDF8", "#7DD3FC"] },
  low:        { color: "#00C896", grad: ["#00C896", "#22D6B2"] },
  moderate:   { color: "#F59E0B", grad: ["#F59E0B", "#FCD34D"] },
  high:       { color: "#EF4444", grad: ["#EF4444", "#F87171"] },
  unreliable: { color: "#4A4A4A", grad: ["#4A4A4A", "#7A7A7A"] },
};

const LABEL_TH: Record<string, string> = {
  clean: "อากาศสะอาด",
  low: "ระดับต่ำ",
  moderate: "ปานกลาง",
  high: "ระดับสูง",
  unreliable: "ไม่แน่ใจ",
};

export function AcetoneRing({ value, label, size = 200 }: Props) {
  const { unit } = useUnits();
  const cfg = LABEL_CONFIG[label ?? ""] ?? LABEL_CONFIG.unreliable;
  const r = (size / 2) - 16;
  const circumference = 2 * Math.PI * r;

  // Map 0–150 mV delta to 0–1 arc fill (matches firmware thresholds: 5/30/80 mV)
  const fill = useMemo(() => {
    if (value == null) return 0;
    return Math.min(1, Math.max(0, value / 150));
  }, [value]);

  const dashOffset = circumference * (1 - fill);
  const gradId = `ring-grad-${label ?? "empty"}`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={cfg.grad[0]} />
            <stop offset="100%" stopColor={cfg.grad[1]} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#262626"
          strokeWidth={12}
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-4xl font-bold tracking-tight" style={{ color: cfg.color }}>
          {formatAcetone(value, unit)}
        </p>
        <p className="text-xs text-text-muted mt-0.5">{unitLabel(unit)}</p>
        {label && (
          <p className="text-xs font-semibold mt-2" style={{ color: cfg.color }}>
            {LABEL_TH[label] ?? label}
          </p>
        )}
      </div>
    </div>
  );
}
