"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type CalibrationReportOut } from "@/lib/api";
import { AlertTriangle, CheckCircle, FileText, Wind } from "lucide-react";

function Metric({ label, value, unit, status }: {
  label: string; value: string | number; unit?: string; status?: "ok" | "warn" | "bad";
}) {
  const color = status === "ok" ? "text-mint-600" : status === "warn" ? "text-amber-600" : status === "bad" ? "text-red-600" : "text-charcoal-500";
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span></p>
    </div>
  );
}

export default function CalibrationReportPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const { data: report, isLoading, error } = useQuery<CalibrationReportOut>({
    queryKey: ["calibration-report", deviceId],
    queryFn: () => api.sensor.calibrationReport(deviceId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
          <FileText size={24} className="text-amber-500" strokeWidth={1.5} />
        </div>
        <h2 className="font-semibold text-gray-900 mb-2">ยังไม่มีข้อมูล Calibration</h2>
        <p className="text-sm text-gray-500 mb-6">ต้อง calibrate อย่างน้อย 1 ครั้งก่อนดู report</p>
        <Link
          href={`/me/device/${deviceId}/calibrate`}
          className="bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl text-sm hover:bg-slate-800 transition"
        >
          เริ่ม Calibration แรก
        </Link>
      </div>
    );
  }

  const driftPct = report.drift_slope_ppm_per_day;
  const driftStatus = Math.abs(driftPct) < 0.05 ? "ok" : Math.abs(driftPct) < 0.15 ? "warn" : "bad";
  const cvStatus = report.repeatability_cv_pct < 5 ? "ok" : report.repeatability_cv_pct < 12 ? "warn" : "bad";
  const lodStatus = report.lod_ppm < 0.3 ? "ok" : report.lod_ppm < 0.5 ? "warn" : "bad";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-mint-50 border border-mint-100 flex items-center justify-center shrink-0">
          <Wind size={18} className="text-mint-600" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calibration Report</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{deviceId.slice(0, 8)}… · {report.n_calibrations} calibrations</p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
        report.needs_recalibration
          ? "bg-red-50 border-red-200"
          : "bg-emerald-50 border-emerald-200"
      }`}>
        {report.needs_recalibration
          ? <AlertTriangle size={18} className="text-red-500 shrink-0" strokeWidth={1.5} />
          : <CheckCircle size={18} className="text-emerald-500 shrink-0" strokeWidth={1.5} />}
        <div>
          <p className={`text-sm font-semibold ${report.needs_recalibration ? "text-red-700" : "text-emerald-700"}`}>
            {report.needs_recalibration ? "ต้อง Calibrate ใหม่" : "Sensor ปกติ"}
          </p>
          <p className={`text-xs ${report.needs_recalibration ? "text-red-600" : "text-emerald-600"}`}>
            Generated: {new Date(report.report_generated_at).toLocaleString("th-TH")}
          </p>
        </div>
        {!report.needs_recalibration && (
          <Link
            href={`/me/device/${deviceId}/calibrate`}
            className="ml-auto text-xs text-emerald-700 hover:underline"
          >
            Calibrate →
          </Link>
        )}
      </div>

      {/* Metrics grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Performance Metrics</h2>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Limit of Detection (LoD)"
            value={report.lod_ppm.toFixed(3)}
            unit="ppm"
            status={lodStatus}
          />
          <Metric
            label="Repeatability CV"
            value={report.repeatability_cv_pct.toFixed(1)}
            unit="%"
            status={cvStatus}
          />
          <Metric
            label="Drift Slope"
            value={(Math.abs(driftPct) * 1000).toFixed(1)}
            unit="ppb/day"
            status={driftStatus}
          />
          <Metric
            label="Latest Drift Score"
            value={(report.latest_drift_score * 100).toFixed(0)}
            unit="%"
            status={report.latest_drift_score < 0.3 ? "ok" : report.latest_drift_score < 0.6 ? "warn" : "bad"}
          />
        </div>
      </div>

      {/* Reference thresholds */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">เกณฑ์อ้างอิง (TGS1820)</h2>
        <div className="space-y-2">
          {[
            { label: "LoD ดี",         threshold: "< 0.3 ppm",   status: "ok"  },
            { label: "CV ดี",           threshold: "< 5%",        status: "ok"  },
            { label: "CV ยอมรับได้",    threshold: "5–12%",       status: "warn"},
            { label: "Drift ต้องระวัง", threshold: "> 0.15 ppm/day", status: "bad"},
          ].map(({ label, threshold, status }) => (
            <div key={label} className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{label}</span>
              <span className={`font-mono font-semibold ${
                status === "ok" ? "text-mint-600" : status === "warn" ? "text-amber-600" : "text-red-600"
              }`}>{threshold}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-sensitivity note */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs text-amber-700 font-semibold mb-1">Cross-Sensitivity Note</p>
        <p className="text-xs text-amber-700">{report.cross_sensitivity_note}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link
          href={`/me/device/${deviceId}/calibrate`}
          className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm hover:bg-slate-800 transition text-center"
        >
          Calibrate ใหม่
        </Link>
        <Link
          href="/me/device"
          className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition text-center"
        >
          กลับ
        </Link>
      </div>
    </div>
  );
}
