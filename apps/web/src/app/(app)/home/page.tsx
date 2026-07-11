"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { parseServerTime } from "@/lib/time";
import { useUnits } from "@/lib/units";
import { AcetoneRing } from "@/components/cards/AcetoneRing";
import { TodayMetricCard } from "@/components/cards/TodayMetricCard";
import { CategoryCard } from "@/components/cards/CategoryCard";
import Link from "next/link";
import { Flame, ChevronRight } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const name = user?.profile?.display_name ?? user?.username ?? "—";
  const { reading: liveReading } = useDeviceStream(user?.id);
  const { format: fmtAcetone, label: unitLbl } = useUnits();

  // "Live" only if we received a reading within the last 60 seconds
  const liveConnected = !!liveReading &&
    (Date.now() - parseServerTime(liveReading.time).getTime() < 60_000);

  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: xp }    = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: quests } = useQuery({ queryKey: ["me", "quests"], queryFn: api.gamification.getQuestsToday });

  // Newest owned device OR a shared device this user has claimed — either
  // path lets us read stats for the physical ESP32.
  const { data: devices } = useQuery({ queryKey: ["sensor", "devices"], queryFn: api.sensor.listDevices });
  const { data: sharedDevices } = useQuery({ queryKey: ["sensor", "shared-devices"], queryFn: api.sensor.listSharedDevices, refetchInterval: 30_000 });
  const deviceId = devices?.[0]?.id ?? sharedDevices?.find((d) => d.claimed_by_me)?.id;
  const { data: dailyStats } = useQuery({
    queryKey: ["sensor", "daily-stats", deviceId, 1],
    queryFn:  () => api.sensor.getDailyStats(deviceId!, 1),
    enabled:  !!deviceId,
    refetchInterval: 30_000,
  });
  const today = dailyStats?.[0];

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  // Hero shows today's peak (max) instead of avg: continuous readings include
  // baseline noise/drift that skews the mean, but peak reflects the highest
  // acetone level observed during a breath test.
  const heroValue = today?.max_acetone_delta ?? liveReading?.acetone_delta_mv ?? null;
  const heroLabel = today?.dominant_label ?? liveReading?.label ?? null;
  const heroCount = today?.count ?? 0;

  const questDone = quests?.filter((q) => q.completed_at).length ?? 0;
  const questTotal = quests?.length ?? 0;

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">{dateStr}</p>
          <h1 className="text-xl font-semibold text-text-primary mt-0.5">{t("health.greeting")}, {name}</h1>
        </div>
        {xp && (
          <div className="text-right">
            <p className="text-xs text-text-muted">Level {xp.level}</p>
            <p className="text-sm font-semibold text-mint-500">{xp.total.toLocaleString()} XP</p>
          </div>
        )}
      </div>

      {/* Acetone hero ring — today's average */}
      <div className="bg-bg-elevated rounded-3xl p-6 flex flex-col items-center gap-4">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">
          BREATH ACETONE · สูงสุดวันนี้
        </p>
        <AcetoneRing value={heroValue} label={heroLabel} size={200} />
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${liveConnected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
          <span className="text-xs text-text-muted">
            {liveConnected ? (
              <>Live · MetaBreath {liveReading && `(${fmtAcetone(liveReading.acetone_delta_mv)} ${unitLbl})`}</>
            ) : heroCount > 0 ? (
              <>{t("health.connectDevice") ?? "อุปกรณ์ไม่ได้เชื่อมต่อ"}</>
            ) : (
              <Link href="/me/device" className="underline text-mint-500">
                {t("health.connectDevice")}
              </Link>
            )}
          </span>
        </div>
      </div>

      {/* Streak */}
      <div className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-peach-500/20 flex items-center justify-center">
          <Flame size={20} className="text-peach-500" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Streak</p>
          <p className="text-xl font-bold text-text-primary">
            {streak?.current ?? 0}
            <span className="text-sm font-medium text-text-muted ml-1">days</span>
          </p>
        </div>
        {questTotal > 0 && (
          <div className="text-right">
            <p className="text-xs text-text-muted">Quests</p>
            <p className="text-sm font-semibold text-text-primary">{questDone}/{questTotal}</p>
          </div>
        )}
      </div>

      {/* Daily entry metrics — tap to log/edit today's value */}
      <div className="grid grid-cols-3 gap-3">
        <TodayMetricCard kind="weight" />
        <TodayMetricCard kind="steps" />
        <TodayMetricCard kind="calories" />
      </div>

      {/* Category cards */}
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Health</p>
        <div className="grid grid-cols-2 gap-3">
          <CategoryCard
            icon="🌬"
            title="Breathing"
            value={heroValue != null ? `${fmtAcetone(heroValue)} ${unitLbl}` : "—"}
            sub={heroLabel ?? "ไม่มีข้อมูล"}
            href="/breathing"
            iconBg="#00C896"
          />
          <CategoryCard
            icon="📈"
            title="Trend"
            value="7-day"
            sub="ดูแนวโน้ม"
            href="/trends"
            iconBg="#3B82F6"
          />
          <CategoryCard
            icon="💤"
            title="Sleep"
            value="—"
            iconBg="#A855F7"
            comingSoon
          />
          <CategoryCard
            icon="❤️"
            title="Heart Rate"
            value="—"
            iconBg="#FF3B4A"
            comingSoon
          />
        </div>
      </div>

      {/* Today's readings log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{t("health.todaySessions")}</p>
          <Link href="/breathing" className="flex items-center gap-0.5 text-xs text-mint-500">
            {t("health.viewAll")} <ChevronRight size={12} />
          </Link>
        </div>
        {liveReading ? (
          <div className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
            <div className="text-right min-w-[44px]">
              <p className="text-xs text-text-muted">{parseServerTime(liveReading.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">{fmtAcetone(liveReading.acetone_delta_mv)} {unitLbl}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {liveReading.pressure_kpa != null && `${liveReading.pressure_kpa.toFixed(2)} kPa · `}
                Q: {liveReading.quality_score?.toFixed(0)}/100
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-bg-elevated rounded-2xl p-4 text-center">
            <p className="text-sm text-text-muted">{t("health.noReadingToday")}</p>
            <Link href="/breathing" className="text-xs text-mint-500 mt-1 block">{t("health.startSession")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
