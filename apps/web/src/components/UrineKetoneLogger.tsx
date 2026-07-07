"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Hash } from "lucide-react";
import { api, type UrineCategory } from "@/lib/api";

// Standard nitroprusside strip bands (Ketostix). Colours are a visual cue only —
// the ordinal band is what matters for the breath↔urine agreement analysis.
const BANDS: { value: UrineCategory; label: string; mg: number; color: string }[] = [
  { value: "negative", label: "Negative", mg: 0,  color: "bg-mint-500/15 text-mint-400 border-mint-500/30" },
  { value: "trace",    label: "Trace",    mg: 5,  color: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  { value: "small",    label: "Small",    mg: 15, color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "moderate", label: "Moderate", mg: 40, color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "large",    label: "Large",    mg: 80, color: "bg-red-500/15 text-red-400 border-red-500/30" },
];

export default function UrineKetoneLogger({ onLogged }: { onLogged?: () => void }) {
  const [selected, setSelected] = useState<UrineCategory | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [mgDl, setMgDl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      if (manualMode) {
        const v = parseFloat(mgDl);
        if (isNaN(v) || v < 0) {
          toast.error("กรอกค่า mg/dL ให้ถูกต้อง");
          setSaving(false);
          return;
        }
        await api.logs.postKetone({ ketone_type: "urine", urine_mg_dl: v });
      } else {
        if (!selected) return;
        await api.logs.postKetone({ ketone_type: "urine", urine_category: selected });
      }
      toast.success("บันทึกค่าคีโตนปัสสาวะแล้ว", {
        description: "จับคู่กับการเป่าล่าสุดโดยอัตโนมัติ (ถ้ามีภายใน 15 นาที)",
      });
      setSelected(null);
      setMgDl("");
      onLogged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = manualMode ? mgDl.trim() !== "" : selected !== null;

  return (
    <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-mint-500" strokeWidth={1.6} />
          <p className="text-sm font-semibold text-text-primary">บันทึกคีโตนปัสสาวะ (ค่าอ้างอิง)</p>
        </div>
        <button
          onClick={() => setManualMode((m) => !m)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <Hash size={12} />
          {manualMode ? "เลือกแถบสี" : "กรอก mg/dL"}
        </button>
      </div>

      {manualMode ? (
        <input
          type="number"
          inputMode="decimal"
          value={mgDl}
          onChange={(e) => setMgDl(e.target.value)}
          placeholder="เช่น 15 (mg/dL)"
          className="w-full bg-bg-raised rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none border border-border-soft focus:border-mint-500"
        />
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {BANDS.map((b) => (
            <button
              key={b.value}
              onClick={() => setSelected(b.value)}
              className={`rounded-xl border px-1 py-2 text-center transition-all ${
                selected === b.value
                  ? b.color + " ring-2 ring-offset-1 ring-offset-bg-elevated ring-mint-500"
                  : b.color + " opacity-60 hover:opacity-100"
              }`}
            >
              <span className="block text-[11px] font-semibold leading-tight">{b.label}</span>
              <span className="block text-[9px] text-text-muted mt-0.5">{b.mg} mg/dL</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit || saving}
        className="w-full rounded-xl bg-mint-500 text-bg-base font-semibold text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
      >
        {saving ? "กำลังบันทึก…" : "บันทึกค่าอ้างอิง"}
      </button>
    </div>
  );
}
