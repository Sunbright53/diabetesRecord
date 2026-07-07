"use client";

import { useEffect, useState } from "react";
import { api, type KetoneAgreementOut } from "@/lib/api";

const URINE_COLS = ["negative", "trace", "small", "moderate", "large"];
const BREATH_LABEL_TH: Record<string, string> = {
  clean: "อากาศสะอาด", low: "ต่ำ", moderate: "ปานกลาง", high: "สูง", unreliable: "ไม่แน่ใจ",
};

function rColor(r: number | null): string {
  if (r === null) return "text-gray-400";
  if (r >= 0.6) return "text-emerald-600";
  if (r >= 0.4) return "text-amber-600";
  return "text-red-500";
}

export default function AdminAgreementPanel() {
  const [data, setData] = useState<KetoneAgreementOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.admin
      .ketoneAgreement()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900 text-sm">ความสอดคล้อง ลมหายใจ ↔ คีโตนปัสสาวะ</h2>
        <span className="text-[11px] text-gray-400">Ground-truth agreement</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        ลมหายใจวัด acetone · ปัสสาวะวัด acetoacetate — สอดคล้องแต่ไม่สมบูรณ์ (มี lag) ใช้ Spearman rank
      </p>

      {loading ? (
        <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : !data || data.n < 3 ? (
        <div className="text-sm text-gray-400 py-6 text-center">
          {data?.interpretation ?? "ยังไม่มีข้อมูลจับคู่"}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <div className={`text-2xl font-bold ${rColor(data.spearman_r)}`}>
                {data.spearman_r?.toFixed(2) ?? "—"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Spearman r</div>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <div className="text-2xl font-bold text-gray-900">{data.n}</div>
              <div className="text-xs text-gray-400 mt-0.5">คู่ที่จับคู่ได้</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{data.interpretation}</p>

          {/* Agreement matrix */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              ตารางเทียบ (แถว = ป้ายลมหายใจ · คอลัมน์ = แถบปัสสาวะ)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-medium py-1.5 pr-2">ลมหายใจ \ ปัสสาวะ</th>
                    {URINE_COLS.map((c) => (
                      <th key={c} className="font-medium py-1.5 px-2 text-center capitalize">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.agreement_matrix.map((row) => (
                    <tr key={row.breath_label} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-700">
                        {BREATH_LABEL_TH[row.breath_label] ?? row.breath_label}
                      </td>
                      {URINE_COLS.map((c) => {
                        const v = row.counts[c] ?? 0;
                        return (
                          <td key={c} className="py-1.5 px-2 text-center">
                            <span className={v > 0 ? "font-semibold text-gray-900" : "text-gray-300"}>{v}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent paired readings */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">คู่ล่าสุด</div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {data.pairs.slice(-10).reverse().map((p, i) => (
                <div key={p.ts + i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-400">
                    {new Date(p.ts).toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-gray-700">
                    <span className="font-semibold">{p.acetone_delta.toFixed(0)} mV</span>
                    <span className="text-gray-300 mx-1.5">↔</span>
                    <span className="capitalize font-semibold">{p.urine_category}</span>
                    <span className="text-gray-400"> ({p.urine_mmol} mmol/L)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
