"use client";

import { type AcetoneUnit, unitLabel, useUnits } from "@/lib/units";

const OPTIONS: AcetoneUnit[] = ["mV", "mmol", "ppm"];

export default function UnitToggle({ className = "" }: { className?: string }) {
  const { unit, setUnit } = useUnits();
  return (
    <div className={`inline-flex rounded-full bg-bg-raised p-0.5 ${className}`}>
      {OPTIONS.map((u) => {
        const active = u === unit;
        return (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
              active ? "bg-mint-500 text-white" : "text-text-muted hover:text-text-primary"
            }`}
          >
            {unitLabel(u)}
          </button>
        );
      })}
    </div>
  );
}
