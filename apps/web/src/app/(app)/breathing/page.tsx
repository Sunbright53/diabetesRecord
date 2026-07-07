"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import { Wind, ChevronRight, Settings, BarChart2, FlaskConical } from "lucide-react";

const LABEL_TH: Record<string, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  unreliable: "ไม่แน่ใจ",
};

const LABEL_COLOR: Record<string, string> = {
  low: "text-mint-500",
  moderate: "text-amber-400",
  high: "text-red-400",
  unreliable: "text-text-muted",
};

export default function BreathingPage() {
  const { user } = useAuth();
  const { reading: liveReading, connected } = useDeviceStream(user?.id);

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  const primaryDevice = devices?.[0];

  const { data: readings } = useQuery({
    queryKey: ["sensor", "readings", primaryDevice?.id],
    queryFn: () => api.sensor.getReadings(primaryDevice!.id, 7),
    enabled: !!primaryDevice,
  });

  const recentReadings = (readings ?? []).slice(-10).reverse();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Device status */}
      <div className="bg-bg-elevated rounded-2xl p-4">
        {primaryDevice ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">{primaryDevice.sensor_model ?? "MetaBreath TGS1820"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`h-2 w-2 rounded-full ${connected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
                <p className="text-xs text-text-muted">{connected ? "Connected · Live" : "Disconnected"}</p>
              </div>
            </div>
            <Link href={`/me/device/${primaryDevice.id}/settings`} className="h-9 w-9 rounded-xl bg-bg-raised flex items-center justify-center">
              <Settings size={16} className="text-text-muted" />
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">ไม่มีอุปกรณ์ที่จับคู่</p>
            <Link href="/me/device/add" className="text-xs text-mint-500 font-medium">+ Add device</Link>
          </div>
        )}
      </div>

      {/* Start session CTA */}
      <div className="flex flex-col items-center py-8">
        <button className="h-28 w-28 rounded-full bg-mint-500/10 border-2 border-mint-500/40 flex flex-col items-center justify-center gap-2 hover:bg-mint-500/20 active:scale-95 transition-all duration-200">
          <Wind size={32} className="text-mint-500" strokeWidth={1.6} />
          <span className="text-xs font-semibold text-mint-500 uppercase tracking-wide">START</span>
        </button>
        <p className="text-xs text-text-muted mt-4">กดเพื่อเริ่มการตรวจ</p>
      </div>

      {/* Quick actions */}
      {primaryDevice && (
        <div className="grid grid-cols-3 gap-3">
          <Link href={`/me/device/${primaryDevice.id}/calibrate`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <FlaskConical size={18} className="text-mint-500" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">Calibrate</span>
          </Link>
          <Link href={`/me/device/${primaryDevice.id}/report`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <BarChart2 size={18} className="text-blue-400" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">Report</span>
          </Link>
          <Link href="/trends" className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <ChevronRight size={18} className="text-text-muted" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">Trend</span>
          </Link>
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Recent Sessions</p>
        </div>

        {recentReadings.length === 0 ? (
          <div className="bg-bg-elevated rounded-2xl p-6 text-center">
            <p className="text-sm text-text-muted">ยังไม่มีประวัติการตรวจ</p>
            <p className="text-xs text-text-disabled mt-1">กดปุ่มเพื่อเริ่มการตรวจครั้งแรก</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentReadings.map((r, idx) => (
              <div key={r.time + idx} className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
                <div className="w-14 text-right">
                  <p className="text-xs text-text-muted">
                    {new Date(r.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-text-disabled mt-0.5">
                    {new Date(r.time).toLocaleDateString("th-TH", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {r.acetone_delta?.toFixed(1) ?? "—"} ppm
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {r.quality_score ? `Q: ${r.quality_score.toFixed(0)}/100` : ""}
                  </p>
                </div>
                {r.label && (
                  <span className={`text-xs font-semibold ${LABEL_COLOR[r.label] ?? "text-text-muted"}`}>
                    {LABEL_TH[r.label] ?? r.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
