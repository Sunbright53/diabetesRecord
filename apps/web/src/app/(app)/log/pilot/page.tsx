"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, PilotSessionOut, CorrelationOut } from "@/lib/api";

function PilotContent() {
  const params = useSearchParams();
  const success = params.get("success");

  const [sessions, setSessions] = useState<PilotSessionOut[]>([]);
  const [correlation, setCorrelation] = useState<CorrelationOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportUrl, setExportUrl] = useState("");

  useEffect(() => {
    setExportUrl(api.pilot.exportUrl());
    Promise.all([api.pilot.listSessions(), api.pilot.getCorrelation()])
      .then(([s, c]) => { setSessions(s); setCorrelation(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const grouped = sessions.reduce<Record<number, PilotSessionOut[]>>((acc, s) => {
    (acc[s.day_number] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 text-emerald-700 font-medium">
          บันทึก session สำเร็จ
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NSC Pilot Study</h1>
          <p className="text-gray-500 text-sm">{sessions.length} sessions recorded</p>
        </div>
        <div className="flex gap-2">
          {exportUrl && (
            <a
              href={exportUrl}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition"
            >
              Export CSV
            </a>
          )}
          <Link
            href="/onboarding/pilot"
            className="text-sm bg-emerald-500 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-600 transition"
          >
            + Log Session
          </Link>
        </div>
      </div>

      {/* Correlation card */}
      {correlation && (
        <div className={`rounded-xl p-5 mb-6 border ${
          correlation.pearson_r && correlation.pearson_r >= 0.7
            ? "bg-emerald-50 border-emerald-200"
            : correlation.pearson_r && correlation.pearson_r >= 0.4
            ? "bg-amber-50 border-amber-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold text-gray-900">
              {correlation.pearson_r !== null ? correlation.pearson_r.toFixed(3) : "—"}
            </span>
            <span className="text-sm text-gray-500">Pearson r</span>
            {correlation.p_value !== null && (
              <span className="text-xs text-gray-400 ml-auto">
                p = {correlation.p_value < 0.001 ? "<0.001" : correlation.p_value.toFixed(3)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 font-medium">{correlation.interpretation}</p>
          <p className="text-xs text-gray-500 mt-1">
            n = {correlation.n} paired measurements
            {correlation.confounders_removed.length > 0 &&
              ` · adjusted for: ${correlation.confounders_removed.join(", ")}`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">กำลังโหลด...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="mb-4">ยังไม่มีข้อมูล session</p>
          <Link href="/onboarding/pilot" className="text-emerald-600 underline text-sm">
            เริ่ม Log Session แรก
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([day, daySessions]) => (
              <div key={day} className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="font-semibold text-gray-800">วันที่ {day}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {daySessions[0]?.cohort}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {daySessions.map((s) => (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-4">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700">
                          {s.timepoint.replace(/_/g, " ")}
                        </span>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          {s.blood_ketone_mmol !== null && s.blood_ketone_mmol !== undefined && (
                            <span>Ketone: {s.blood_ketone_mmol} mmol/L</span>
                          )}
                          {s.blood_glucose !== null && s.blood_glucose !== undefined && (
                            <span>Glucose: {s.blood_glucose} mg/dL</span>
                          )}
                          {s.homa_ir !== null && s.homa_ir !== undefined && (
                            <span>HOMA-IR: {s.homa_ir}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-400">
                        {s.food_type && <div>{s.food_type}</div>}
                        {s.fasting_hours && <div>{s.fasting_hours}h fast</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function PilotLogPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}>
      <PilotContent />
    </Suspense>
  );
}
