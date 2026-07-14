"use client";

import { convertFromMv } from "@/lib/units";

// 5-zone metabolic ladder (matches the copy in Screenshot 2569-07-14 at 16.19.38).
// Ranges are inclusive of the low bound and exclusive of the high bound.
type Zone = {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  range: string;
  lo: number;   // ppm
  hi: number;   // ppm (Infinity for the last one)
  desc: string;
  color: string;      // hex — icon dot + accent
  accentBg: string;   // tailwind class for the "active" row background
  accentBorder: string;
};

const ZONES: Zone[] = [
  {
    n: 1,
    name: "Rest Zone",
    range: "0.5 – 2 ppm",
    lo: 0,
    hi: 2,
    desc: "ร่างกายกำลังใช้พลังงานจากอาหารมื้อล่าสุด",
    color: "#3B82F6",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/40",
  },
  {
    n: 2,
    name: "Fat-Burn Zone",
    range: "2 – 8 ppm",
    lo: 2,
    hi: 8,
    desc: "เยี่ยม! ร่างกายเริ่มดึงไขมันสะสมมาใช้เป็นพลังงานแล้ว",
    color: "#10B981",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/40",
  },
  {
    n: 3,
    name: "Deep Burn Zone",
    range: "8 – 40 ppm",
    lo: 8,
    hi: 40,
    desc: "ร่างกายอยู่ในโหมดเผาผลาญไขมันเต็มที่",
    color: "#F59E0B",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/40",
  },
  {
    n: 4,
    name: "Peak Zone",
    range: "40 – 170 ppm",
    lo: 40,
    hi: 170,
    desc: "ร่างกายอยู่ในภาวะเผาผลาญไขมันระดับสูง",
    color: "#EA580C",
    accentBg: "bg-orange-500/10",
    accentBorder: "border-orange-500/40",
  },
  {
    n: 5,
    name: "Caution Zone",
    range: "มากกว่า 170 ppm",
    lo: 170,
    hi: Infinity,
    desc: "ค่าที่วัดได้สูงผิดปกติ — ลองสังเกตอาการตัวเองสักหน่อยนะ",
    color: "#EF4444",
    accentBg: "bg-red-500/10",
    accentBorder: "border-red-500/40",
  },
];

function zoneOf(ppm: number): Zone {
  return ZONES.find((z) => ppm >= z.lo && ppm < z.hi) ?? ZONES[0];
}

interface Props {
  /** Latest acetone value in raw mV (baseline delta). Pass null when no data yet. */
  currentMv: number | null;
  /** When true, show a "live" pulse dot next to the current value. */
  live?: boolean;
}

export function AcetoneZoneCard({ currentMv, live = false }: Props) {
  const ppm = currentMv != null ? convertFromMv(currentMv, "ppm") : null;
  const activeZone = ppm != null ? zoneOf(ppm) : null;

  return (
    <div className="bg-bg-elevated rounded-2xl p-4 space-y-4">
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-2">
          Metabolic Zone · ค่าปัจจุบัน
        </p>
        {ppm != null && activeZone ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: activeZone.color }}>
              {ppm.toFixed(2)}
            </span>
            <span className="text-sm text-text-muted">ppm</span>
            {live && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-mint-500">
                <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse" />
                LIVE
              </span>
            )}
            <span className="ml-auto text-xs font-semibold" style={{ color: activeZone.color }}>
              Zone {activeZone.n} · {activeZone.name}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-disabled">—</span>
            <span className="text-sm text-text-muted">ppm</span>
            <span className="ml-auto text-xs text-text-muted">ยังไม่มีข้อมูล</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {ZONES.map((z) => {
          const isActive = activeZone?.n === z.n;
          return (
            <div
              key={z.n}
              className={`rounded-xl p-3 border transition-colors ${
                isActive
                  ? `${z.accentBg} ${z.accentBorder}`
                  : "bg-bg-raised border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{
                    background: z.color,
                    boxShadow: isActive ? `0 0 0 3px ${z.color}22` : "none",
                  }}
                />
                <p className={`text-sm font-semibold ${isActive ? "text-text-primary" : "text-text-primary/80"}`}>
                  Zone {z.n}: {z.name}
                </p>
                <span className="ml-auto text-[11px] text-text-muted font-mono">{z.range}</span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed pl-5 ${isActive ? "text-text-primary" : "text-text-muted"}`}>
                {z.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
