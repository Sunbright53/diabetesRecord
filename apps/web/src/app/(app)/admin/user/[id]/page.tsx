"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { api, UserDashboardOut, DashboardReading } from "@/lib/api";

// ── Label colors (match rest of admin console) ──────────────────────────────
const LABEL_COLOR: Record<string, string> = {
  clean:      "#94a3b8",
  low:        "#10b981",
  moderate:   "#f59e0b",
  high:       "#ef4444",
  unreliable: "#a855f7",
  normal:     "#10b981",
  elevated:   "#f59e0b",
  very_high:  "#ef4444",
  unknown:    "#e5e7eb",
};

const LABEL_TH: Record<string, string> = {
  clean:      "อากาศสะอาด",
  low:        "ต่ำ",
  moderate:   "ปานกลาง",
  high:       "สูง",
  unreliable: "เชื่อถือไม่ได้",
  normal:     "ปกติ",
  elevated:   "สูงขึ้น",
  very_high:  "สูงมาก",
  unknown:    "ไม่ระบุ",
};

const DAY_OPTIONS = [
  { label: "24 ชม.", days: 1 },
  { label: "7 วัน",  days: 7 },
  { label: "30 วัน", days: 30 },
];

// ── Small UI atoms ──────────────────────────────────────────────────────────
function LabelBadge({ label }: { label: string | null }) {
  if (!label) return <span className="text-xs text-gray-300">—</span>;
  const color = LABEL_COLOR[label] ?? "#e5e7eb";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {LABEL_TH[label] ?? label}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function UserDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UserDashboardOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load dashboard whenever id or window changes
  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    setLoading(true);
    setErr("");
    api.admin
      .userDashboard(id, days)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [params?.id, days]);

  // Bounce back to /admin if password gate isn't unlocked yet
  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("admin_password")) {
      router.replace("/admin");
    }
  }, [router]);

  // ── Derived chart data ────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.series.map((r: DashboardReading) => ({
      t: new Date(r.time).getTime(),
      acetone: r.acetone_delta,
      quality: r.quality_score,
      label: r.label,
    }));
  }, [data]);

  const donutData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.label_counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  if (err) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-sm mb-4">{err}</div>
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-slate-700 hover:text-slate-900 underline"
          >
            ← กลับ Admin Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/admin")}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-600"
            aria-label="กลับ"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {data ? (
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 text-sm truncate">
                {data.user.display_name || data.user.username}
              </div>
              <div className="text-xs text-gray-400 truncate">{data.user.email}</div>
            </div>
          ) : (
            <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
          )}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                days === opt.days ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="บันทึกทั้งหมด"
            value={loading || !data ? "—" : String(data.kpi.total_readings)}
            sub={data ? `ใน ${data.window_days} วัน` : undefined}
          />
          <KpiCard
            label="วันที่ใช้งาน"
            value={loading || !data ? "—" : String(data.kpi.active_days)}
            sub="days active"
          />
          <KpiCard
            label="Acetone Δ เฉลี่ย"
            value={loading || !data || data.kpi.avg_acetone_delta === null ? "—" : `${data.kpi.avg_acetone_delta.toFixed(2)}`}
            sub="mV"
          />
          <KpiCard
            label="คุณภาพเฉลี่ย"
            value={loading || !data || data.kpi.avg_quality_score === null ? "—" : `${data.kpi.avg_quality_score.toFixed(0)}%`}
            sub={data?.kpi.avg_reliability_score !== null ? `reliability ${data?.kpi.avg_reliability_score?.toFixed(0)}%` : undefined}
          />
        </div>

        {/* Time series chart */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Acetone Δ ตามเวลา</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {data ? `${chartData.length} จุด (downsampled)` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-slate-800 rounded" /> acetone_delta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 border-t border-dashed border-amber-500" /> 30 mV
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 border-t border-dashed border-red-500" /> 80 mV
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            {loading || !data ? (
              <div className="w-full h-full bg-gray-50 rounded-xl animate-pulse" />
            ) : chartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                ไม่มีข้อมูลในช่วง {data.window_days} วันที่ผ่านมา
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return days <= 1
                        ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                        : d.toLocaleDateString("th-TH", { month: "short", day: "numeric" });
                    }}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    stroke="#e5e7eb"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    stroke="#e5e7eb"
                    label={{ value: "mV", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#9ca3af" } }}
                  />
                  <Tooltip
                    labelFormatter={(v) => new Date(v as number).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    formatter={(v) => {
                      if (typeof v !== "number") return ["—", "Acetone Δ"];
                      return [`${v.toFixed(2)} mV`, "Acetone Δ"];
                    }}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="acetone"
                    stroke="#1e293b"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Donut + Devices row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Label donut */}
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">สัดส่วน Label</h2>
            <div className="h-64 w-full">
              {loading || !data ? (
                <div className="w-full h-full bg-gray-50 rounded-xl animate-pulse" />
              ) : donutData.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                  ไม่มีข้อมูล
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={LABEL_COLOR[entry.name] ?? "#e5e7eb"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [v as number, LABEL_TH[name as string] ?? (name as string)]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Legend
                      formatter={(name: string) => <span className="text-xs text-gray-600">{LABEL_TH[name] ?? name}</span>}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Devices */}
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">อุปกรณ์ ({data?.devices.length ?? 0})</h2>
            {loading || !data ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : data.devices.length === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">ไม่มีอุปกรณ์</div>
            ) : (
              <div className="space-y-2">
                {data.devices.map((d) => {
                  const online = d.last_seen_at && new Date(d.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000;
                  return (
                    <div key={d.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : "bg-gray-300"}`} />
                          <span className="text-sm font-medium text-gray-900">{d.sensor_model || d.kind}</span>
                          {d.needs_recalibration && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                              recalibrate
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{d.total_readings} readings</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-gray-400">Last seen</div>
                          <div className="text-gray-700">
                            {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Baseline</div>
                          <div className="text-gray-700">
                            {d.baseline_voc !== null ? `${d.baseline_voc.toFixed(3)} V` : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Drift</div>
                          <div className="text-gray-700">
                            {d.drift_score !== null ? d.drift_score.toFixed(2) : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-300 font-mono mt-2 truncate">{d.id}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Recent readings */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">
            บันทึกล่าสุด (20 รายการ)
          </h2>
          {loading || !data ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : data.recent.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">ไม่มีข้อมูล</div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left font-medium px-5 py-2">เวลา</th>
                    <th className="text-right font-medium px-3 py-2">Acetone Δ</th>
                    <th className="text-right font-medium px-3 py-2">Pressure</th>
                    <th className="text-right font-medium px-3 py-2">Temp/Hum</th>
                    <th className="text-right font-medium px-3 py-2">Quality</th>
                    <th className="text-right font-medium px-5 py-2">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, idx) => (
                    <tr key={`${r.time}-${idx}`} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                      <td className="px-5 py-2 text-xs text-gray-600">
                        {new Date(r.time).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-800">
                        {r.acetone_delta !== null ? r.acetone_delta.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">
                        {r.pressure_mean !== null ? `${r.pressure_mean.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">
                        {r.temp_c !== null && r.humidity_pct !== null
                          ? `${r.temp_c.toFixed(0)}°/${r.humidity_pct.toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">
                        {r.quality_score !== null ? `${r.quality_score.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-5 py-2 text-right">
                        <LabelBadge label={r.label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Ketone logs */}
        {data && data.ketone_logs.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">
              Ketone logs (30 วันล่าสุด · {data.ketone_logs.length} รายการ)
            </h2>
            <div className="space-y-2">
              {data.ketone_logs.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-gray-800 font-medium">
                      {k.ketone_type === "urine" ? `Urine · ${k.urine_category}` : `Blood · ${k.value_mmol?.toFixed(2) ?? "—"} mmol/L`}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">{k.source ?? ""}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(k.ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
