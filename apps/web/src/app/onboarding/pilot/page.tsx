"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const COHORTS = ["5day_20p", "14day_10p"];
const TIMEPOINTS = ["fasting", "post_meal_60", "post_meal_120"];
const FOOD_TYPES = ["low_carb", "high_carb", "keto", "mixed"];

export default function PilotOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    cohort: "5day_20p",
    day_number: 1,
    timepoint: "fasting",
    // Demographics
    bmi: "",
    waist_cm: "",
    age: "",
    sex: "",
    // Context
    fasting_hours: "",
    food_type: "mixed",
    activity_min: "",
    sleep_hours: "",
    // Gold standard
    homa_ir: "",
    blood_glucose: "",
    blood_ketone_mmol: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const payload = {
        cohort: form.cohort,
        day_number: parseInt(form.day_number as unknown as string),
        timepoint: form.timepoint,
        ...(form.bmi ? { bmi: parseFloat(form.bmi) } : {}),
        ...(form.waist_cm ? { waist_cm: parseFloat(form.waist_cm) } : {}),
        ...(form.age ? { age: parseInt(form.age) } : {}),
        ...(form.sex ? { sex: form.sex } : {}),
        ...(form.fasting_hours ? { fasting_hours: parseFloat(form.fasting_hours) } : {}),
        ...(form.food_type ? { food_type: form.food_type } : {}),
        ...(form.activity_min ? { activity_min: parseInt(form.activity_min) } : {}),
        ...(form.sleep_hours ? { sleep_hours: parseFloat(form.sleep_hours) } : {}),
        ...(form.homa_ir ? { homa_ir: parseFloat(form.homa_ir) } : {}),
        ...(form.blood_glucose ? { blood_glucose: parseFloat(form.blood_glucose) } : {}),
        ...(form.blood_ketone_mmol ? { blood_ketone_mmol: parseFloat(form.blood_ketone_mmol) } : {}),
      };
      await api.pilot.createSession(payload);
      router.push("/log/pilot?success=1");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8">
        <div className="mb-6">
          <div className="flex gap-2 mb-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full ${s <= step ? "bg-emerald-500" : "bg-gray-200"}`}
              />
            ))}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">NSC Pilot Study</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 1 && "ข้อมูลการศึกษา"}
            {step === 2 && "บริบทประจำวัน"}
            {step === 3 && "ค่าอ้างอิงทางการแพทย์ (Gold Standard)"}
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cohort</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.cohort}
                onChange={(e) => set("cohort", e.target.value)}
              >
                {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ (Day)</label>
              <input
                type="number" min={1} max={14}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.day_number}
                onChange={(e) => set("day_number", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timepoint</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.timepoint}
                onChange={(e) => set("timepoint", e.target.value)}
              >
                {TIMEPOINTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BMI</label>
                <input type="number" step="0.1" placeholder="25.0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={form.bmi} onChange={(e) => set("bmi", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (cm)</label>
                <input type="number" step="0.5" placeholder="85"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={form.waist_cm} onChange={(e) => set("waist_cm", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อายุ</label>
                <input type="number" placeholder="35"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={form.age} onChange={(e) => set("age", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เพศ</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={form.sex} onChange={(e) => set("sex", e.target.value)}>
                  <option value="">เลือก...</option>
                  <option value="M">ชาย</option>
                  <option value="F">หญิง</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-lg transition"
            >
              ถัดไป
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อดอาหารมา (ชั่วโมง)</label>
              <input type="number" step="0.5" placeholder="12"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.fasting_hours} onChange={(e) => set("fasting_hours", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทอาหาร</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.food_type} onChange={(e) => set("food_type", e.target.value)}>
                {FOOD_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">กิจกรรม (นาที)</label>
              <input type="number" placeholder="30"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.activity_min} onChange={(e) => set("activity_min", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชั่วโมงนอน</label>
              <input type="number" step="0.5" placeholder="7.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.sleep_hours} onChange={(e) => set("sleep_hours", e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg">
                ย้อนกลับ
              </button>
              <button onClick={() => setStep(3)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-lg transition">
                ถัดไป
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ค่าเหล่านี้ใช้เป็น Gold Standard เพื่อพิสูจน์ความสัมพันธ์กับ MetaBreath sensor
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HOMA-IR</label>
              <input type="number" step="0.01" placeholder="1.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.homa_ir} onChange={(e) => set("homa_ir", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Glucose (mg/dL)</label>
              <input type="number" step="1" placeholder="95"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.blood_glucose} onChange={(e) => set("blood_glucose", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Ketone (mmol/L)</label>
              <input type="number" step="0.1" placeholder="0.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={form.blood_ketone_mmol} onChange={(e) => set("blood_ketone_mmol", e.target.value)} />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg">
                ย้อนกลับ
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
              >
                {loading ? "กำลังบันทึก..." : "บันทึก Session"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
