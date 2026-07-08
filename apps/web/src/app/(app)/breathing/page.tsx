"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import { ChevronRight, Settings, BarChart2, FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import UrineKetoneLogger from "@/components/UrineKetoneLogger";
import BreathSession, {
  RecentBreathSessions,
  loadSessions,
  type SessionSummary,
} from "@/components/BreathSession";

export default function BreathingPage() {
  const { user } = useAuth();
  const { t } = useT();
  const queryClient = useQueryClient();
  const { reading: liveReading } = useDeviceStream(user?.id);
  const [sessions, setSessions] = useState<SessionSummary[]>(() => loadSessions());

  // "Connected" = actually receiving data (last reading < 60s), not just WS open
  const connected = !!liveReading &&
    (Date.now() - new Date(liveReading.time).getTime() < 60_000);

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  const primaryDevice = devices?.[0];

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
            <p className="text-sm text-text-muted">{t("breathing.noDevice")}</p>
            <Link href="/me/device/add" className="text-xs text-mint-500 font-medium">{t("breathing.addDevice")}</Link>
          </div>
        )}
      </div>

      {/* Breath session — START button → 5-second count → result card */}
      <BreathSession
        liveReading={liveReading}
        connected={connected}
        onSessionSaved={() => setSessions(loadSessions())}
      />

      {/* Quick actions */}
      {primaryDevice && (
        <div className="grid grid-cols-3 gap-3">
          <Link href={`/me/device/${primaryDevice.id}/calibrate`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <FlaskConical size={18} className="text-mint-500" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.calibrate")}</span>
          </Link>
          <Link href={`/me/device/${primaryDevice.id}/report`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <BarChart2 size={18} className="text-blue-400" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.report")}</span>
          </Link>
          <Link href="/trends" className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <ChevronRight size={18} className="text-text-muted" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.trend")}</span>
          </Link>
        </div>
      )}

      {/* Urine ketone reference (ground truth for breath↔urine agreement) */}
      <UrineKetoneLogger
        onLogged={() => queryClient.invalidateQueries({ queryKey: ["logs", "ketone"] })}
      />

      {/* Recent sessions — stored locally after each breath session */}
      <RecentBreathSessions sessions={sessions} />
    </div>
  );
}
