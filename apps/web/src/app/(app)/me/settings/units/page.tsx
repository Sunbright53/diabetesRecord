"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { type AcetoneUnit, convertFromMv, useUnits } from "@/lib/units";
import { twMerge } from "tailwind-merge";

type UnitOption = {
  value: AcetoneUnit;
  label: string;
  desc: string;
  example: string;
};

// Reference value = 40 mV so switching between units gives an intuitive preview
const REF_MV = 40;

const OPTIONS: UnitOption[] = [
  {
    value: "mV",
    label: "mV",
    desc: "แรงดันดิบจากเซนเซอร์ (baseline delta)",
    example: `${convertFromMv(REF_MV, "mV").toFixed(0)} mV`,
  },
  {
    value: "mmol",
    label: "mmol/L",
    desc: "เทียบเท่าค่าคีโตนในเลือด (ที่แถบตรวจปัสสาวะแสดง)",
    example: `${convertFromMv(REF_MV, "mmol").toFixed(1)} mmol/L`,
  },
  {
    value: "ppm",
    label: "ppm",
    desc: "ความเข้มข้น acetone ในลมหายใจ (ppm ทางการแพทย์)",
    example: `${convertFromMv(REF_MV, "ppm").toFixed(1)} ppm`,
  },
];

export default function UnitsSettingsPage() {
  const router = useRouter();
  const { unit, setUnit } = useUnits();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">หน่วยของ Acetone</h1>
      </div>

      <p className="text-sm text-text-muted leading-relaxed">
        เลือกหน่วยที่ใช้แสดงค่า breath acetone ทั้งแอป — Health, Trends, และหน้าอื่นๆ จะเปลี่ยนตามอัตโนมัติ
      </p>

      <div className="space-y-3">
        {OPTIONS.map((opt) => {
          const active = unit === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setUnit(opt.value)}
              className={twMerge(
                "w-full text-left rounded-2xl border p-4 transition-colors",
                active
                  ? "border-mint-500 bg-mint-500/10"
                  : "border-border-soft bg-bg-elevated hover:border-border-strong"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={twMerge(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                    active ? "border-mint-500 bg-mint-500" : "border-border-strong"
                  )}
                >
                  {active && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={twMerge("text-base font-semibold", active ? "text-mint-500" : "text-text-primary")}>
                      {opt.label}
                    </p>
                    <span className="text-xs text-text-muted font-mono">{opt.example}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">{opt.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-bg-elevated rounded-2xl p-4 space-y-2">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">การแปลงหน่วย</p>
        <ul className="text-xs text-text-muted space-y-1.5 leading-relaxed">
          <li>• <span className="text-text-primary font-medium">mV → mmol/L</span>: หาร 20 (สอดคล้องกับ backend classifier)</li>
          <li>• <span className="text-text-primary font-medium">mV → ppm</span>: หาร 10 (ประมาณจาก TGS1820 datasheet curve)</li>
          <li>• ค่าเป็นการประมาณเท่านั้น — ยังไม่ได้ per-device calibration</li>
        </ul>
      </div>
    </div>
  );
}
