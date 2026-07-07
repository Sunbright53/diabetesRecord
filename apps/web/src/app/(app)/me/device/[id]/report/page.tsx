"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type CalibrationReportOut } from "@/lib/api";
import { AlertTriangle, CheckCircle, FileText, Wind, ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

function Metric({ label, value, unit, status }: {
  label: string; value: string | number; unit?: string; status?: "ok" | "warn" | "bad";
}) {
  const color =
    status === "ok"  ? "text-mint-500"  :
    status === "warn" ? "text-warning" :
    status === "bad"  ? "text-danger"  :
    "text-text-primary";
  return (
    <div className="bg-bg-raised rounded-xl p-4">
      <p className="text-xs text-text-muted font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        <span className="text-sm font-normal text-text-muted ml-1">{unit}</span>
      </p>
    </div>
  );
}

export default function CalibrationReportPage() {
  const params = useParams();
  const router = useRouter();
  const { locale } = useT();
  const deviceId = params.id as string;

  const { data: report, isLoading, error } = useQuery<CalibrationReportOut>({
    queryKey: ["calibration-report", deviceId],
    queryFn: () => api.sensor.calibrationReport(deviceId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
          <FileText size={24} className="text-warning" strokeWidth={1.5} />
        </div>
        <h2 className="font-semibold text-text-primary mb-2">ยังไม่มีข้อมูล Calibration</h2>
        <p className="text-sm text-text-muted mb-6">ต้อง calibrate อย่างน้อย 1 ครั้งก่อนดู report</p>
        <Link href={`/me/device/${deviceId}/calibrate`} className="bg-mint-500 text-white font-semibold py-3 px-6 rounded-full text-sm hover:bg-mint-400 transition-colors">
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
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Calibration Report</h1>
          <p className="text-xs text-text-muted font-mono mt-0.5">{deviceId.slice(0, 8)}… · {report.n_calibrations} calibrations</p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
        report.needs_recalibration ? "bg-danger/10 border-danger/20" : "bg-mint-500/10 border-mint-500/20"
      }`}>
        {report.needs_recalibration
          ? <AlertTriangle size={18} className="text-danger shrink-0" strokeWidth={1.5} />
          : <CheckCircle   size={18} className="text-mint-500 shrink-0" strokeWidth={1.5} />}
        <div>
          <p className={`text-sm font-semibold ${report.needs_recalibration ? "text-danger" : "text-mint-500"}`}>
            {report.needs_recalibration ? "ต้อง Calibrate ใหม่" : "Sensor ปกติ"}
          </p>
          <p className="text-xs text-text-muted">
            {new Date(report.report_generated_at).toLocaleString(locale === "th" ? "th-TH-u-ca-gregory" : "en-US", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        {report.needs_recalibration && (
          <Link href={`/me/device/${deviceId}/calibrate`} className="ml-auto text-xs text-danger font-semibold underline">
            Calibrate →
          </Link>
        )}
      </div>

      {/* Metrics grid */}
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Performance Metrics</p>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Limit of Detection (LoD)" value={report.lod_ppm.toFixed(3)} unit="ppm" status={lodStatus} />
          <Metric label="Repeatability CV" value={report.repeatability_cv_pct.toFixed(1)} unit="%" status={cvStatus} />
          <Metric label="Drift Slope" value={(Math.abs(driftPct) * 1000).toFixed(1)} unit="ppb/day" status={driftStatus} />
          <Metric label="Latest Drift Score" value={(report.latest_drift_score * 100).toFixed(0)} unit="%" status={report.latest_drift_score < 0.3 ? "ok" : report.latest_drift_score < 0.6 ? "warn" : "bad"} />
        </div>
      </div>

      {/* Reference thresholds */}
      <div className="bg-bg-elevated rounded-2xl p-4">
        <p className="text-sm font-semibold text-text-primary mb-3">เกณฑ์อ้างอิง (TGS1820)</p>
        <div className="space-y-2">
          {[
            { label: "LoD ดี",            threshold: "< 0.3 ppm",      status: "ok"   },
            { label: "CV ดี",              threshold: "< 5%",           status: "ok"   },
            { label: "CV ยอมรับได้",       threshold: "5–12%",          status: "warn" },
            { label: "Drift ต้องระวัง",    threshold: "> 0.15 ppm/day", status: "bad"  },
          ].map(({ label, threshold, status }) => (
            <div key={label} className="flex justify-between items-center text-xs py-1.5 border-b border-border-soft last:border-0">
              <span className="text-text-muted">{label}</span>
              <span className={`font-mono font-semibold ${
                status === "ok" ? "text-mint-500" : status === "warn" ? "text-warning" : "text-danger"
              }`}>{threshold}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-sensitivity note */}
      <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4">
        <p className="text-xs text-warning font-semibold mb-1">Cross-Sensitivity Note</p>
        <p className="text-xs text-text-secondary">{report.cross_sensitivity_note}</p>
      </div>

      {/* Wind icon context */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Wind size={12} className="text-mint-500" strokeWidth={1.6} />
        <span>TGS1820 acetone sensor · {report.n_calibrations} sessions recorded</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href={`/me/device/${deviceId}/calibrate`} className="flex-1 bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 transition-colors text-center">
          Calibrate ใหม่
        </Link>
        <Link href="/me/device" className="flex-1 border border-border-strong text-text-secondary font-semibold py-3 rounded-full text-sm hover:bg-bg-elevated transition-colors text-center">
          กลับ
        </Link>
      </div>
    </div>
  );
}
