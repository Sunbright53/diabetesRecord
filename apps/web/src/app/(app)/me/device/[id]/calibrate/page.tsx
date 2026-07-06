"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { CheckCircle, Info } from "lucide-react";

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
              i === idx ? "bg-slate-900 text-white ring-4 ring-slate-200" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] ${i === idx ? "text-slate-900 font-semibold" : "text-gray-400"}`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 mb-4 mx-1 ${i < idx ? "bg-mint-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function CalibratePage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;

  const [step, setStep] = useState<Step>("intro");
  const [ambientVoc, setAmbientVoc] = useState("");
  const [baselineTemp, setBaselineTemp] = useState("");
  const [baselineHumidity, setBaselineHumidity] = useState("");
  const [baselinePressure, setBaselinePressure] = useState("");
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
        baseline_pressure: baselinePressure ? parseFloat(baselinePressure) : undefined,
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-8 p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Calibrate อุปกรณ์</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{deviceId.slice(0, 8)}…</p>
        </div>

        <StepBar current={step} />

        {/* Step: Intro */}
        {step === "intro" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <Info size={18} className="text-blue-500 shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">ทำไมต้อง Calibrate?</p>
                <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
                  <li>เซนเซอร์ TGS1820 drift เมื่อเวลาผ่านไป</li>
                  <li>อุณหภูมิและความชื้นส่งผลต่อค่าที่วัด</li>
                  <li>ควร calibrate ทุก 2–4 สัปดาห์</li>
                </ul>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-700">
              <p className="font-semibold">ขั้นตอน:</p>
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p>วางอุปกรณ์ในอากาศสะอาด <strong>5 นาที</strong> ก่อนเริ่ม</p>
              </div>
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p>อ่านค่า VOC ambient จากหน้าจออุปกรณ์</p>
              </div>
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p>กรอกค่าที่อ่านได้ในหน้าถัดไป</p>
              </div>
            </div>

            <button
              onClick={() => setStep("ambient")}
              className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm hover:bg-slate-800 transition"
            >
              เริ่ม Calibration
            </button>

            <Link href={`/me/device/${deviceId}/report`} className="block text-center text-xs text-mint-600 hover:underline">
              ดู Calibration Report →
            </Link>
          </div>
        )}

        {/* Step: Ambient reading */}
        {step === "ambient" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              กรอกค่าที่อ่านจากอุปกรณ์ขณะวางในอากาศสะอาด (ไม่เป่าลม)
            </p>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Ambient VOC (ppm) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={ambientVoc}
                onChange={(e) => setAmbientVoc(e.target.value)}
                placeholder="เช่น 0.45"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">อุณหภูมิ (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={baselineTemp}
                  onChange={(e) => setBaselineTemp(e.target.value)}
                  placeholder="25.0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">ความชื้น (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={baselineHumidity}
                  onChange={(e) => setBaselineHumidity(e.target.value)}
                  placeholder="60.0"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">หมายเหตุ (ไม่บังคับ)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น หลังทำความสะอาด, สภาพอากาศปกติ"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
              />
            </div>

            <button
              onClick={() => {
                if (!ambientVoc || isNaN(parseFloat(ambientVoc))) {
                  setError("กรุณากรอกค่า Ambient VOC");
                  return;
                }
                setError("");
                setStep("confirm");
              }}
              className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm hover:bg-slate-800 transition"
            >
              ถัดไป
            </button>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <p className="font-semibold text-gray-800 text-sm">ยืนยันค่า Calibration</p>

            <div className="space-y-2">
              {[
                { label: "Ambient VOC",  value: `${ambientVoc} ppm` },
                { label: "อุณหภูมิ",      value: baselineTemp     ? `${baselineTemp} °C`  : "—" },
                { label: "ความชื้น",       value: baselineHumidity ? `${baselineHumidity} %` : "—" },
                { label: "หมายเหตุ",       value: notes || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-medium text-gray-900">{value}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("ambient")}
                className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition"
              >
                แก้ไข
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 bg-mint-500 hover:bg-mint-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition"
              >
                {loading ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <div className="bg-white rounded-2xl border border-emerald-100 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Calibration สำเร็จ!</h2>
              <p className="text-sm text-gray-400 mt-1">ค่า baseline ถูกบันทึกแล้ว</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drift Score</span>
                <span className={`font-semibold ${result.drift_score > 0.5 ? "text-amber-600" : "text-mint-600"}`}>
                  {(result.drift_score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">สถานะ</span>
                <span className={`font-semibold ${result.needs_recalibration ? "text-red-600" : "text-mint-600"}`}>
                  {result.needs_recalibration ? "ต้อง recalibrate เร็ว ๆ นี้" : "ปกติ"}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Link
                href={`/me/device/${deviceId}/report`}
                className="block w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm hover:bg-slate-800 transition text-center"
              >
                ดู Calibration Report
              </Link>
              <Link
                href="/me/device"
                className="block text-gray-400 text-sm py-2 hover:text-gray-600 transition text-center"
              >
                กลับไปอุปกรณ์
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
