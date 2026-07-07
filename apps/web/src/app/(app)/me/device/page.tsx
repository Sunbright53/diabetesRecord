"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import {
  FlaskConical, Zap, Target, Moon, Dumbbell,
  Bell, Database, Wrench, Settings, Shield, ChevronRight, Plus,
} from "lucide-react";

const SENSOR_MODES = [
  { icon: FlaskConical, label: "Calibrate", color: "#00C896", href: (id: string) => `/me/device/${id}/calibrate` },
  { icon: Zap,         label: "Fast scan",  color: "#F59E0B", href: () => "#" },
  { icon: Target,      label: "Precision",  color: "#3B82F6", href: () => "#" },
  { icon: Moon,        label: "Sleep mode", color: "#A855F7", href: () => "#" },
  { icon: Dumbbell,    label: "Exercise",   color: "#10B981", href: () => "#" },
];

const MENU_ITEMS = [
  { icon: Bell,     label: "Notifications & alerts",  href: "#" },
  { icon: Database, label: "Sensor data & history",   href: "#" },
  { icon: FlaskConical, label: "Calibration & reports", href: (id: string) => `/me/device/${id}/report` },
  { icon: Wrench,   label: "Sensor settings",          href: "#" },
  { icon: Shield,   label: "Data privacy",             href: "#" },
  { icon: Settings, label: "Advanced settings",        href: "#" },
];

export default function DevicePage() {
  const { user } = useAuth();
  const { connected } = useDeviceStream(user?.id);

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  const device = devices?.[0];

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Device hero card */}
      <div className="bg-bg-elevated rounded-3xl overflow-hidden">
        {/* Device image placeholder */}
        <div className="h-40 bg-gradient-to-br from-mint-500/10 to-blue-500/10 flex items-center justify-center">
          <div className="h-20 w-20 rounded-2xl bg-bg-raised flex items-center justify-center">
            <span className="text-4xl">🫁</span>
          </div>
        </div>

        <div className="p-4">
          {device ? (
            <>
              <p className="text-lg font-bold text-text-primary">
                {device.sensor_model ?? "MetaBreath TGS1820 v1"}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`h-2 w-2 rounded-full ${connected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
                <p className="text-sm text-text-muted">
                  {connected ? "Connected" : "Device disconnected"}
                </p>
              </div>

              {device.needs_recalibration && (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-amber-400 text-sm">⚠️</span>
                  <p className="text-xs text-amber-400">ต้องการ calibrate</p>
                  <Link href={`/me/device/${device.id}/calibrate`} className="ml-auto text-xs text-amber-400 font-semibold underline">
                    Calibrate now
                  </Link>
                </div>
              )}

              <button className="mt-3 w-full bg-mint-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-mint-400 transition-colors">
                {connected ? "● Connected" : "Connect"}
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-text-muted">ยังไม่มีอุปกรณ์</p>
              <Link href="/me/device/add">
                <button className="mt-3 w-full bg-mint-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-mint-400 transition-colors flex items-center justify-center gap-2">
                  <Plus size={16} />
                  Add your first device
                </button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Sensor modes */}
      {device && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Sensor Modes</p>
            <button className="text-xs text-mint-500">All ›</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {SENSOR_MODES.map(({ icon: Icon, label, color, href }) => (
              <Link
                key={label}
                href={href(device.id)}
                className="flex flex-col items-center gap-2 flex-shrink-0"
              >
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: color + "20" }}
                >
                  <Icon size={20} style={{ color }} strokeWidth={1.6} />
                </div>
                <span className="text-xs text-text-muted text-center leading-tight w-14">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Menu */}
      {device && (
        <div className="bg-bg-elevated rounded-2xl overflow-hidden">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest px-4 pt-4 pb-2">Menu</p>
          {MENU_ITEMS.map(({ icon: Icon, label, href }, idx) => {
            const resolvedHref = typeof href === "function" ? href(device.id) : href;
            return (
              <Link
                key={label}
                href={resolvedHref}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-bg-raised transition-colors ${idx < MENU_ITEMS.length - 1 ? "border-b border-border-soft" : ""}`}
              >
                <div className="h-8 w-8 rounded-lg bg-bg-raised flex items-center justify-center">
                  <Icon size={15} className="text-text-muted" strokeWidth={1.6} />
                </div>
                <span className="flex-1 text-sm text-text-primary">{label}</span>
                <ChevronRight size={14} className="text-text-disabled" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Add another device */}
      {device && (
        <Link href="/me/device/add" className="flex items-center gap-3 bg-bg-elevated rounded-2xl p-4 hover:bg-bg-raised transition-colors">
          <div className="h-8 w-8 rounded-lg bg-mint-500/20 flex items-center justify-center">
            <Plus size={16} className="text-mint-500" />
          </div>
          <span className="text-sm text-text-primary">Add another device</span>
          <ChevronRight size={14} className="text-text-disabled ml-auto" />
        </Link>
      )}
    </div>
  );
}
