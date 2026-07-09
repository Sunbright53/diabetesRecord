"use client";

import { useState, useEffect } from "react";
import { twMerge } from "tailwind-merge";
import { ChevronDown } from "lucide-react";

const MONTHS_EN = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_TH = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];

interface DobPickerProps {
  value?: string;        // YYYY-MM-DD
  onChange: (val: string) => void;
  label?: string;
  locale?: "en" | "th";
}

const selectBase =
  "h-11 w-full appearance-none rounded-xl border border-border bg-white text-gray-900 pl-3 pr-8 text-sm outline-none transition cursor-pointer focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20";

function Select({
  value,
  onChange,
  children,
  className,
}: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={twMerge(selectBase, className)}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

export function DobPicker({ value, onChange, label, locale = "en" }: DobPickerProps) {
  const currentYear = new Date().getFullYear();
  const minYear = 1924;
  const maxYear = currentYear - 10;

  const parse = (v?: string) => {
    if (!v) return { d: 0, m: 0, y: 0 };
    const [yr, mo, dy] = v.split("-").map(Number);
    return { d: dy || 0, m: mo || 0, y: yr || 0 };
  };

  const { d: initD, m: initM, y: initY } = parse(value);
  const [day, setDay] = useState(initD);
  const [month, setMonth] = useState(initM);
  const [year, setYear] = useState(initY);

  useEffect(() => {
    const { d, m, y } = parse(value);
    setDay(d); setMonth(m); setYear(y);
  }, [value]);

  const emit = (d: number, m: number, y: number) => {
    if (d && m && y) {
      onChange(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  };

  const months = locale === "th" ? MONTHS_TH : MONTHS_EN;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const placeholderCls = "text-gray-400";

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-gray-700">{label}</p>}
      <div className="flex gap-2">
        {/* Day */}
        <Select
          value={day || ""}
          onChange={(v) => { const d = +v; setDay(d); emit(d, month, year); }}
          className={!day ? placeholderCls : ""}
        >
          <option value="" disabled>{locale === "th" ? "วัน" : "Day"}</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>

        {/* Month */}
        <Select
          value={month || ""}
          onChange={(v) => { const m = +v; setMonth(m); emit(day, m, year); }}
          className={twMerge("flex-[1.6]", !month ? placeholderCls : "")}
        >
          <option value="" disabled>{locale === "th" ? "เดือน" : "Month"}</option>
          {months.map((mn, i) => (
            <option key={i} value={i + 1}>{mn}</option>
          ))}
        </Select>

        {/* Year */}
        <Select
          value={year || ""}
          onChange={(v) => { const y = +v; setYear(y); emit(day, month, y); }}
          className={twMerge("flex-[1.3]", !year ? placeholderCls : "")}
        >
          <option value="" disabled>{locale === "th" ? "ปี" : "Year"}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
