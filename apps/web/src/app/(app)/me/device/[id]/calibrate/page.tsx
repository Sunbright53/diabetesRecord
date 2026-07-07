"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { CheckCircle, Info, ArrowLeft } from "lucide-react";

type Step = "intro" | "ambient" | "confirm" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "intro",   label: "เตรียม" },
  { id: "ambient", label: "วัด ambient" },
  { id: "confirm", label: "ยืนยัน" },
  { id: "done",    label: "เสร็จ" },
];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < idx  ? "bg-mint-500 text-white" :
              i === idx ? "bg-mint-500/20 text-mint-500 ring-2 ring-mint-500" :
              "bg-bg-raised text-text-disabled"
            }`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] ${i === idx ? "text-text-primary font-semibold" : "text-text-disabled"}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 mb-4 mx-1 ${i < idx ? "bg-mint-500" : "bg-border-soft"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const inputCls = "w-full bg-bg-raised border border-border-soft rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-mint-500 transition-colors";

export default function CalibratePage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;

  const [step, setStep] = useState<Step>("intro");
  const [ambientVoc, setAmbientVoc] = useState("");
  const [baselineTemp, setBaselineTemp] = useState("");
  const [baselineHumidity, setBaselineHumidity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ drift_score: number; needs_recalibration: boolean } | null>(null);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await api.sensor.calibrateDevice(deviceId, {
        baseline_voc:      parseFloat(ambientVoc),
        baseline_temp:     baselineTemp     ? parseFloat(baselineTemp)     : undefined,
        baseline_humidity: baselineHumidity ? parseFloat(baselineHumidity) : undefined,
        method:            "manual_ambient",
        notes:             notes || undefined,
      });
      setResult({ drift_score: res.drift_score, needs_recalibration: res.needs_recalibration ?? false });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 pt-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Calibrate อุปกรณ์</h1>
          <p className="text-xs text-text-muted font-mono">{deviceId.slice(0, 8)}…</p>
        </div>
      </div>

      <StepBar current={step} />

      {/* Step: Intro */}
      {step === "intro" && (
        <div className="bg-bg-elevated rounded-2xl p-5 space-y-4">
          <div className="flex gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <Info size={18} className="text-blue-400 shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="text-sm text-blue-300">
              <p className="font-semibold mb-1">ทำไมต้อง Calibrate?</p>
              <ul className="space-y-1 text-xs text-blue-400 list-disc list-inside">
                <li>เซนเซอร์ TGS1820 drift เมื่อเวลาผ่านไป</li>
                <li>อุณหภูมิและความชื้นส่งผลต่อค่าที่วัด</li>
                <li>ควร calibrate ทุก 2–4 สัปดาห์</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <p className="font-semibold text-text-primary">ขั้นตอน:</p>
            {[
              "วางอุปกรณ์ในอากาศสะอาด 5 นาที ก่อนเริ่ม",
              "อ่านค่า VOC ambient จากหน้าจออุปกรณ์",
              "กรอกค่าที่อ่านได้ในหน้าถัดไป",
            ].map((text, i) => (
              <div key={i} className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-mint-500/20 text-mint-500 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                <p>{text}</p>
              </div>
            ))}
          </div>

          <button onClick={() => setStep("ambient")} className="w-full bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 transition-colors">
            เริ่ม Calibration
          </button>
          <Link href={`/me/device/${deviceId}/report`} className="block text-center text-xs text-mint-500 hover:underline">
            ดู Calibration Report →
          </Link>
        </div>
      )}

      {/* Step: Ambient reading */}
      {step === "ambient" && (
        <div className="bg-bg-elevated rounded-2xl p-5 space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            กรอกค่าที่อ่านจากอุปกรณ์ขณะวางในอากาศสะอาด (ไม่เป่าลม)
          </p>

          <div>
            <label className="text-xs font-semibold text-text-muted mb-1.5 block">Ambient VOC (ppm) *</label>
            <input type="number" step="0.01" min="0" max="100" value={ambientVoc} onChange={(e) => setAmbientVoc(e.target.value)} placeholder="เช่น 0.45" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-muted mb-1.5 block">อุณหภูมิ (°C)</label>
              <input type="number" step="0.1" value={baselineTemp} onChange={(e) => setBaselineTemp(e.target.value)} placeholder="25.0" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted mb-1.5 block">ความชื้น (%)</label>
              <input type="number" step="0.1" value={baselineHumidity} onChange={(e) => setBaselineHumidity(e.target.value)} placeholder="60.0" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-muted mb-1.5 block">หมายเหตุ</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เช่น สภาพอากาศปกติ" className={inputCls} />
          </div>

          <button onClick={() => { if (!ambientVoc || isNaN(parseFloat(ambientVoc))) { setError("กรุณากรอกค่า Ambient VOC"); return; } setError(""); setStep("confirm"); }} className="w-full bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 transition-colors">
            ถัดไป
          </button>
          {error && <p className="text-danger text-sm text-center">{error}</p>}
        </div>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && (
        <div className="bg-bg-elevated rounded-2xl p-5 space-y-4">
          <p className="font-semibold text-text-primary text-sm">ยืนยันค่า Calibration</p>

          <div className="space-y-0">
            {[
              { label: "Ambient VOC",  value: `${ambientVoc} ppm` },
              { label: "อุณหภูมิ",      value: baselineTemp     ? `${baselineTemp} °C`  : "—" },
              { label: "ความชื้น",       value: baselineHumidity ? `${baselineHumidity} %` : "—" },
              { label: "หมายเหตุ",       value: notes || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center py-2.5 border-b border-border-soft last:border-0">
                <span className="text-sm text-text-muted">{label}</span>
                <span className="text-sm font-medium text-text-primary">{value}</span>
              </div>
            ))}
          </div>

          {error && <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-danger text-sm">{error}</div>}

          <div className="flex gap-3">
            <button onClick={() => setStep("ambient")} className="flex-1 border border-border-strong text-text-secondary font-semibold py-3 rounded-full text-sm hover:bg-bg-raised transition-colors">
              แก้ไข
            </button>
            <button onClick={submit} disabled={loading} className="flex-1 bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 disabled:opacity-50 transition-colors">
              {loading ? "กำลังบันทึก..." : "ยืนยัน"}
            </button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <div className="bg-bg-elevated rounded-2xl p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-mint-500/20 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-mint-500" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Calibration สำเร็จ!</h2>
            <p className="text-sm text-text-muted mt-1">ค่า baseline ถูกบันทึกแล้ว</p>
          </div>

          <div className="bg-bg-raised rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Drift Score</span>
              <span className={`font-semibold ${result.drift_score > 0.5 ? "text-warning" : "text-mint-500"}`}>
                {(result.drift_score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">สถานะ</span>
              <span className={`font-semibold ${result.needs_recalibration ? "text-danger" : "text-mint-500"}`}>
                {result.needs_recalibration ? "ต้อง recalibrate เร็ว ๆ นี้" : "ปกติ"}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <Link href={`/me/device/${deviceId}/report`} className="block w-full bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 transition-colors text-center">
              ดู Calibration Report
            </Link>
            <Link href="/me/device" className="block text-text-muted text-sm py-2 hover:text-text-primary transition-colors text-center">
              กลับไปอุปกรณ์
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
