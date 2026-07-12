"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const ITEM_H = 42;    // px per item
const PADDING = 1;    // items above/below center (3 visible total: 1 + center + 1)

interface DrumPickerProps {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  unit: string;
  bgImage: string;
  className?: string;
}

export function DrumPicker({ values, value, onChange, label, unit, bgImage, className }: DrumPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [centerIdx, setCenterIdx] = useState(Math.max(0, values.indexOf(value)));

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(value));
    if (scrollRef.current) scrollRef.current.scrollTop = idx * ITEM_H;
    setCenterIdx(idx);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const idx = Math.round(scrollRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    setCenterIdx(clamped);
    onChange(values[clamped]);
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      scrollRef.current?.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
    }, 120);
  }, [values, onChange]);

  const containerH = ITEM_H * (PADDING * 2 + 1); // = 42 * 3 = 126px

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className ?? ""}`}
      style={{ height: containerH }}
    >
      {/* Background photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgImage}')` }}
      />
      {/* Dark scrim */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Top/bottom gradient fade */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 32%, transparent 68%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Center selection band */}
      <div
        className="absolute inset-x-8 z-20 pointer-events-none"
        style={{
          top: ITEM_H * PADDING,
          height: ITEM_H,
          borderTop: "1px solid rgba(255,255,255,0.35)",
          borderBottom: "1px solid rgba(255,255,255,0.35)",
        }}
      />

      {/* Label top */}
      <div className="absolute top-0 inset-x-0 pt-1.5 text-center z-20 pointer-events-none">
        <span className="text-white/80 text-[11px] font-semibold tracking-wide">{label}</span>
      </div>

      {/* Unit bottom */}
      <div className="absolute bottom-0 inset-x-0 pb-1.5 text-center z-20 pointer-events-none">
        <span className="text-white/40 text-[10px] tracking-[0.15em] uppercase">{unit}</span>
      </div>

      {/* Scrollable drum — constrained touch-action prevents stealing page scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-scroll z-30"
        style={{
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
        } as React.CSSProperties}
      >
        <div style={{ height: ITEM_H * PADDING }} aria-hidden="true" />
        {values.map((v, i) => {
          const dist = Math.abs(i - centerIdx);
          return (
            <div
              key={v}
              style={{ height: ITEM_H, scrollSnapAlign: "center" }}
              className="flex items-center justify-center"
            >
              <span
                style={{
                  color: "white",
                  fontSize: dist === 0 ? "1.8rem" : "1.1rem",
                  fontWeight: dist === 0 ? 700 : 400,
                  opacity: dist === 0 ? 1 : 0.4,
                  lineHeight: 1,
                  transition: "font-size 0.1s ease, opacity 0.1s ease",
                  userSelect: "none",
                }}
              >
                {v}
              </span>
            </div>
          );
        })}
        <div style={{ height: ITEM_H * PADDING }} aria-hidden="true" />
      </div>
    </div>
  );
}
