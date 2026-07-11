"use client";

import type { ContextTag } from "@/lib/api";
import { Wind, UtensilsCrossed, Dumbbell, Moon, X } from "lucide-react";

interface Option {
  tag: ContextTag;
  icon: React.ReactNode;
  th: string;
  sub: string;
}

const OPTIONS: Option[] = [
  {
    tag: "fasting",
    icon: <Wind size={22} />,
    th: "อดอาหาร",
    sub: "ยังไม่ได้กินมากกว่า 4 ชม.",
  },
  {
    tag: "post_meal",
    icon: <UtensilsCrossed size={22} />,
    th: "หลังกิน",
    sub: "กินอาหารมาแล้ว 1–3 ชม.",
  },
  {
    tag: "post_exercise",
    icon: <Dumbbell size={22} />,
    th: "หลังออกกำลัง",
    sub: "ออกกำลังกายมาไม่เกิน 2 ชม.",
  },
  {
    tag: "evening",
    icon: <Moon size={22} />,
    th: "ช่วงเย็น / ก่อนนอน",
    sub: "วัดประจำวันตอนเย็น",
  },
];

interface Props {
  onSelect: (tag: ContextTag) => void;
  onSkip: () => void;
}

export function ContextSelector({ onSelect, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onSkip} />

      {/* Sheet */}
      <div className="relative w-full bg-bg-surface rounded-t-3xl pb-10 px-4 pt-5 max-w-md mx-auto">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">ก่อนเริ่มวัด</h2>
            <p className="text-xs text-text-muted mt-0.5">คุณอยู่ในสภาวะไหนตอนนี้?</p>
          </div>
          <button onClick={onSkip} className="p-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt.tag}
              onClick={() => onSelect(opt.tag)}
              className="flex flex-col items-start gap-2.5 p-4 rounded-2xl bg-bg-elevated border border-border-subtle hover:border-mint-500/60 hover:bg-mint-500/5 active:scale-95 transition-all text-left"
            >
              <span className="text-mint-500">{opt.icon}</span>
              <div>
                <p className="text-sm font-semibold text-text-primary">{opt.th}</p>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{opt.sub}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onSkip}
          className="w-full mt-4 py-3 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ข้ามไปก่อน
        </button>
      </div>
    </div>
  );
}
