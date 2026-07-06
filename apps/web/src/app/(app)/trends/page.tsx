"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wind } from "lucide-react";
import { EmptyChartIllustration } from "@/components/brand/empty-chart";
import { twMerge } from "tailwind-merge";

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted">
      <EmptyChartIllustration className="h-16" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

const ACETONE_LABEL_COLOR: Record<string, string> = {
  low: "bg-mint-500",
  moderate: "bg-amber-400",
  high: "bg-red-500",
  unreliable: "bg-gray-300",
};

const ACETONE_ZONE_COLOR: Record<string, string> = {
  low:        "#00C896",
  moderate:   "#F59E0B",
  high:       "#EF4444",
  unreliable: "#9CA3AF",
};

export default function TrendsPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const { reading: liveReading, connected: liveConnected } = useDeviceStream(user?.id);

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.sensor.listDevices(),
  });

  const RANGES = [
    { label: t("trends.ranges.d7"),  days: 7  },
    { label: t("trends.ranges.d30"), days: 30 },
    { label: t("trends.ranges.d90"), days: 90 },
  ];

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const fmt = (ts: string) =>
    new Date(ts).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

  const { data: ketone, isLoading: kLoading } = useQuery({
    queryKey: ["ketone", days],
    queryFn:  () => api.logs.getKetone({ days }),
  });

  const { data: weight, isLoading: wLoading } = useQuery({
    queryKey: ["weight", days],
    queryFn:  () => api.logs.getWeight({ days }),
  });

  // Pick first active device if none selected
  const effectiveDevice = selectedDevice ?? devices?.find((d) => d.active)?.id ?? devices?.[0]?.id ?? null;

  const { data: sensorReadings, isLoading: sLoading } = useQuery({
    queryKey: ["sensor-readings", effectiveDevice, days],
    queryFn:  () => api.sensor.getReadings(effectiveDevice!, days),
    enabled:  !!effectiveDevice,
  });

  const ketoneData = (ketone ?? []).map((k) => ({
    date:  fmt(k.ts),
    value: +k.value_mmol.toFixed(2),
  }));

  const acetoneData = (sensorReadings ?? [])
    .filter((r) => r.acetone_delta !== null)
    .map((r) => ({
      date:     fmt(r.time),
      value:    +(r.acetone_delta!.toFixed(2)),
      label:    r.label ?? "unreliable",
      quality:  r.quality_score ?? 0,
    }));

  const weightData = (weight ?? []).map((w) => ({
    date:  fmt(w.ts),
    value: +w.kg.toFixed(1),
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      {/* Title + range picker on separate rows to avoid clash with lang switcher */}
      <div>
        <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">{t("trends.title")}</h1>
        <div className="mt-3 inline-flex gap-1 rounded-xl bg-surface-2 border border-border-soft p-1">
          {RANGES.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={twMerge(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                days === d
                  ? "bg-white text-mint-700 shadow-sm"
                  : "text-muted hover:text-charcoal-500"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Live breath acetone from MetaBreath device */}
      {(liveConnected || liveReading) && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-charcoal-500 tracking-tight">Breath Acetone (Live)</h2>
                <p className="text-xs text-muted mt-0.5">ppm — MetaBreath TGS1820</p>
              </div>
              <div className="flex items-center gap-2">
                {liveReading && (
                  <span className={`h-2 w-2 rounded-full ${ACETONE_LABEL_COLOR[liveReading.label] ?? "bg-gray-300"}`} />
                )}
                <Badge variant={liveConnected ? "mint" : "gray"}>
                  {liveConnected ? "Live" : "Disconnected"}
                </Badge>
              </div>
            </div>
            {liveReading ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-charcoal-500">{liveReading.acetone_delta.toFixed(1)}</p>
                  <p className="text-[10px] text-muted mt-0.5">ppm acetone</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-charcoal-500">{liveReading.quality_score.toFixed(0)}</p>
                  <p className="text-[10px] text-muted mt-0.5">quality/100</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-charcoal-500">{(liveReading.confidence_score * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-muted mt-0.5">confidence</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted text-center py-3">รอข้อมูลจากอุปกรณ์...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ketone chart */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-charcoal-500 tracking-tight">{t("trends.ketoneTitle")}</h2>
              <p className="text-xs text-muted mt-0.5">mmol/L</p>
            </div>
            {ketoneData.length > 0 && (
              <Badge variant="mint">
                {t("trends.avg")}{" "}
                {(
                  ketoneData.reduce((s, d) => s + d.value, 0) /
                  ketoneData.length
                ).toFixed(2)}{" "}
                mmol/L
              </Badge>
            )}
          </div>

          {kLoading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
            </div>
          ) : ketoneData.length === 0 ? (
            <EmptyChart label={t("trends.emptyKetone")} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ketoneData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEEDE8" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #EEEDE8", fontSize: 12 }}
                  formatter={(v) => [`${v} mmol/L`, t("trends.ketoneTitle")]}
                />
                <ReferenceLine y={0.5} stroke="#00C896" strokeDasharray="4 3" label={{ value: t("trends.ketosis"), fontSize: 10, fill: "#009B74" }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#00C896"
                  strokeWidth={2}
                  dot={{ fill: "#00C896", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Weight chart */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-charcoal-500 tracking-tight">{t("trends.weightTitle")}</h2>
              <p className="text-xs text-muted mt-0.5">kg</p>
            </div>
            {weightData.length > 0 && (
              <Badge variant="peach">
                {t("trends.latest")} {weightData[weightData.length - 1].value} kg
              </Badge>
            )}
          </div>

          {wLoading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
            </div>
          ) : weightData.length === 0 ? (
            <EmptyChart label={t("trends.emptyWeight")} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEEDE8" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #EEEDE8", fontSize: 12 }}
                  formatter={(v) => [`${v} kg`, t("trends.weightTitle")]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#B08D57"
                  strokeWidth={2}
                  dot={{ fill: "#B08D57", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breath Acetone history */}
      {(devices && devices.length > 0) && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Wind size={14} className="text-mint-500" strokeWidth={1.6} />
                  <h2 className="font-semibold text-charcoal-500 tracking-tight">Breath Acetone</h2>
                </div>
                <p className="text-xs text-muted mt-0.5">ppm — TGS1820</p>
              </div>
              <div className="flex items-center gap-2">
                {acetoneData.length > 0 && (
                  <Badge variant="mint">
                    เฉลี่ย {(acetoneData.reduce((s, d) => s + d.value, 0) / acetoneData.length).toFixed(1)} ppm
                  </Badge>
                )}
                <select
                  value={effectiveDevice ?? ""}
                  onChange={(e) => setSelectedDevice(e.target.value || null)}
                  className="text-xs border border-border-soft rounded-lg px-2 py-1 text-charcoal-500 bg-surface-2 focus:outline-none"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id.slice(0, 8)}… {d.active ? "●" : "○"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sLoading ? (
              <div className="h-40 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
              </div>
            ) : acetoneData.length === 0 ? (
              <EmptyChart label="ยังไม่มีข้อมูล breath acetone" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={acetoneData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEEDE8" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#6B6B65" }} stroke="#D9D7D0" />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #EEEDE8", fontSize: 12 }}
                      formatter={(v, _name, props) => [
                        `${v} ppm (${props.payload?.label ?? ""})`,
                        "Acetone",
                      ]}
                    />
                    <ReferenceLine y={2} stroke="#F59E0B" strokeDasharray="4 3" label={{ value: "Moderate", fontSize: 10, fill: "#B45309" }} />
                    <ReferenceLine y={5} stroke="#EF4444" strokeDasharray="4 3" label={{ value: "High", fontSize: 10, fill: "#B91C1C" }} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#00C896"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const color = ACETONE_ZONE_COLOR[payload.label] ?? "#9CA3AF";
                        return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1.5} />;
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[
                    { label: "low",        color: "#00C896", text: "ต่ำ (<2 ppm)" },
                    { label: "moderate",   color: "#F59E0B", text: "ปานกลาง (2-5 ppm)" },
                    { label: "high",       color: "#EF4444", text: "สูง (>5 ppm)" },
                    { label: "unreliable", color: "#9CA3AF", text: "ไม่น่าเชื่อถือ" },
                  ].map(({ label, color, text }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      {text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
