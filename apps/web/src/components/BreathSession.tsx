"use client";

import { useEffect, useRef, useState } from "react";
import { Wind, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AcetoneLabel, LiveReading } from "@/lib/useDeviceStream";

const DURATION_MS = 5_000;
const STORAGE_KEY = "breath-sessions";
const MAX_STORED = 20;
const MIN_SAMPLES = 5;

export interface SessionSummary {
  id: string;
  at: string;
  n_samples: number;
  peak_mv: number;
  mean_mv: number;
  pressure_mean_kpa: number | null;
  quality_score: number | null;
  label: AcetoneLabel | null;
}

export function loadSessions(): SessionSummary[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function persist(s: SessionSummary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([s, ...loadSessions()].slice(0, MAX_STORED)));
}

function trimmedMean(vals: number[]): number {
  if (!vals.length) return 0;
  const trim = Math.floor(vals.length * 0.2);
  const end = vals.length - trim;
  const mid = end > trim ? vals.slice(trim, end) : vals;
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}

function modeLabel(samples: LiveReading[]): AcetoneLabel | null {
  const c: Record<string, number> = {};
  for (const s of samples) if (s.label) c[s.label] = (c[s.label] ?? 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return (top?.[0] as AcetoneLabel) ?? null;
}

const LABEL_TH: Record<string, string> = {
  clean: "อากาศสะอาด",
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  unreliable: "ไม่แน่ใจ",
};

const LABEL_COLOR: Record<string, string> = {
  clean: "text-sky-400",
  low: "text-mint-500",
  moderate: "text-amber-400",
  high: "text-red-400",
  unreliable: "text-text-muted",
};

type Phase = "idle" | "counting" | "done";

// Geometry for w-28 (112 px) progress ring
const SZ = 112;
const SW = 5;
const RING_R = (SZ - SW) / 2;
const CIRC = 2 * Math.PI * RING_R;

interface Props {
  liveReading: LiveReading | null;
  connected: boolean;
  onSessionSaved?: () => void;
}

export default function BreathSession({ liveReading, connected, onSessionSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SessionSummary | null>(null);

  const t0 = useRef(0);
  const samplesRef = useRef<LiveReading[]>([]);
  const lastReading = useRef<LiveReading | null>(null);
  const rafId = useRef<number | null>(null);
  const onSavedRef = useRef(onSessionSaved);
  useEffect(() => { onSavedRef.current = onSessionSaved; }, [onSessionSaved]);

  // Accumulate samples while counting
  useEffect(() => {
    if (phase !== "counting" || !liveReading || liveReading === lastReading.current) return;
    lastReading.current = liveReading;
    samplesRef.current.push(liveReading);
  }, [liveReading, phase]);

  // RAF loop — smooth progress, triggers finalize at 100 %
  useEffect(() => {
    if (phase !== "counting") return;

    const tick = () => {
      const p = Math.min(100, ((Date.now() - t0.current) / DURATION_MS) * 100);
      setProgress(p);

      if (p >= 100) {
        finalize();
        return;
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function finalize() {
    const s = samplesRef.current;
    if (s.length < MIN_SAMPLES) {
      toast.error("ข้อมูลไม่เพียงพอ — ลองเป่าใหม่", { description: `ได้รับเพียง ${s.length} ตัวอย่าง` });
      reset();
      return;
    }

    const mvs = s.map((r) => r.acetone_delta_mv);
    const pressures = s.map((r) => r.pressure_kpa).filter((v): v is number => v != null);
    const qualities = s.map((r) => r.quality_score);

    const summary: SessionSummary = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      n_samples: s.length,
      peak_mv: Math.max(...mvs),
      mean_mv: trimmedMean(mvs),
      pressure_mean_kpa: pressures.length
        ? pressures.reduce((a, b) => a + b, 0) / pressures.length
        : null,
      quality_score: qualities.reduce((a, b) => a + b, 0) / qualities.length,
      label: modeLabel(s),
    };

    persist(summary);
    setResult(summary);
    setPhase("done");
    toast.success("บันทึกเซสชั่นแล้ว");
    onSavedRef.current?.();
  }

  function start() {
    if (!connected) {
      toast.error("กรุณาเชื่อมต่ออุปกรณ์ก่อนเริ่มตรวจ", {
        action: { label: "ไปที่ Device", onClick: () => { window.location.href = "/me/device"; } },
      });
      return;
    }
    samplesRef.current = [];
    lastReading.current = null;
    t0.current = Date.now();
    setProgress(0);
    setPhase("counting");
  }

  function reset() {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    setPhase("idle");
    setProgress(0);
    setResult(null);
    samplesRef.current = [];
  }

  const secsLeft = Math.ceil(DURATION_MS / 1000 * (1 - progress / 100));
  const dashOffset = CIRC * (1 - progress / 100);
  const liveMv = liveReading?.acetone_delta_mv ?? 0;

  /* ── idle ── */
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center py-8">
        <button
          onClick={start}
          className="h-28 w-28 rounded-full bg-mint-500/10 border-2 border-mint-500/40 flex flex-col items-center justify-center gap-2 hover:bg-mint-500/20 active:scale-95 transition-all duration-200"
        >
          <Wind
            size={32}
            className={connected ? "text-mint-500" : "text-text-muted"}
            strokeWidth={1.6}
          />
          <span className={`text-xs font-semibold uppercase tracking-wide ${connected ? "text-mint-500" : "text-text-muted"}`}>
            START
          </span>
        </button>
        <p className="text-xs text-text-muted mt-4">
          {connected ? "กดเพื่อเริ่มการตรวจ" : "เชื่อมต่ออุปกรณ์ก่อนเริ่ม"}
        </p>
      </div>
    );
  }

  /* ── counting ── */
  if (phase === "counting") {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="relative" style={{ width: SZ, height: SZ }}>
          <svg width={SZ} height={SZ} className="rotate-[-90deg]">
            {/* track */}
            <circle
              cx={SZ / 2} cy={SZ / 2} r={RING_R}
              fill="none" stroke="currentColor"
              className="text-mint-500/20"
              strokeWidth={SW}
            />
            {/* progress arc */}
            <circle
              cx={SZ / 2} cy={SZ / 2} r={RING_R}
              fill="none" stroke="currentColor"
              className="text-mint-500"
              strokeWidth={SW}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-mint-500 leading-none">{secsLeft}</span>
            <span className="text-[11px] text-text-muted mt-1">{liveMv.toFixed(0)} mV</span>
          </div>
        </div>
        <p className="text-sm font-medium text-text-primary">เป่าออกยาวๆ ค้างไว้</p>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={12} />
          ยกเลิก
        </button>
      </div>
    );
  }

  /* ── done ── */
  if (!result) return null;
  const lColor = LABEL_COLOR[result.label ?? ""] ?? "text-text-muted";
  const lText = LABEL_TH[result.label ?? ""] ?? result.label ?? "—";

  return (
    <div className="py-2">
      <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">ผลการตรวจ</p>
          <span className={`text-sm font-bold ${lColor}`}>{lText}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { val: result.peak_mv.toFixed(0), label: "Peak (mV)" },
              { val: result.mean_mv.toFixed(0), label: "Mean (mV)" },
              { val: result.quality_score?.toFixed(0) ?? "—", label: "Quality" },
            ] as const
          ).map(({ val, label }) => (
            <div key={label} className="bg-bg-raised rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{val}</p>
              <p className="text-[10px] text-text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {result.pressure_mean_kpa != null && (
          <p className="text-xs text-text-muted text-center">
            แรงดัน {result.pressure_mean_kpa.toFixed(2)} kPa · {result.n_samples} ตัวอย่าง
          </p>
        )}

        <button
          onClick={reset}
          className="w-full rounded-xl border border-border-soft text-text-muted text-sm py-2.5 flex items-center justify-center gap-2 hover:bg-bg-raised transition-colors"
        >
          <RefreshCw size={14} />
          เป่าใหม่
        </button>
      </div>
    </div>
  );
}

/* ── Recent sessions list (reads from localStorage) ── */
export function RecentBreathSessions({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <div>
      <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">
        Recent Sessions
      </p>
      {sessions.length === 0 ? (
        <div className="bg-bg-elevated rounded-2xl p-6 text-center">
          <p className="text-sm text-text-muted">ยังไม่มีประวัติการตรวจ</p>
          <p className="text-xs text-text-disabled mt-1">กดปุ่มเพื่อเริ่มการตรวจครั้งแรก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const lColor = LABEL_COLOR[s.label ?? ""] ?? "text-text-muted";
            const lText = LABEL_TH[s.label ?? ""] ?? s.label ?? "—";
            return (
              <div key={s.id} className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
                <div className="w-14 text-right">
                  <p className="text-xs text-text-muted">
                    {new Date(s.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-text-disabled mt-0.5">
                    {new Date(s.at).toLocaleDateString("th-TH", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {s.peak_mv.toFixed(0)} mV
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    mean {s.mean_mv.toFixed(0)} mV
                    {s.pressure_mean_kpa != null && ` · ${s.pressure_mean_kpa.toFixed(2)} kPa`}
                  </p>
                </div>
                <span className={`text-xs font-semibold ${lColor}`}>{lText}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
