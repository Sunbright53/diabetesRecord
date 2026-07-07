"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { AcetoneRing } from "@/components/cards/AcetoneRing";
import { MetricCard } from "@/components/cards/MetricCard";
import { CategoryCard } from "@/components/cards/CategoryCard";
import Link from "next/link";
import { Flame, ChevronRight } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const name = user?.profile?.display_name ?? user?.username ?? "—";
  const { reading: liveReading, connected: liveConnected } = useDeviceStream(user?.id);

  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: xp }    = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: quests } = useQuery({ queryKey: ["me", "quests"], queryFn: api.gamification.getQuestsToday });

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  const liveValue = liveReading?.acetone_delta ?? null;
  const liveLabel = liveReading?.label ?? null;

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

      {/* Acetone hero ring */}
      <div className="bg-bg-elevated rounded-3xl p-6 flex flex-col items-center gap-4">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{t("health.liveBreath")}</p>
        <AcetoneRing value={liveValue} label={liveLabel} size={200} />
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${liveConnected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
          <span className="text-xs text-text-muted">
            {liveConnected ? "Live · MetaBreath" : (
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

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard icon="🔥" label="Calories" value="—" goal={undefined} unit="kcal" />
        <MetricCard icon="👣" label="Steps"    value="—" goal={undefined} />
        <MetricCard icon="⏱" label="Move"     value="—" unit="min" goal={undefined} />
      </div>

      {/* Category cards */}
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Health</p>
        <div className="grid grid-cols-2 gap-3">
          <CategoryCard
            icon="🌬"
            title="Breathing"
            value={liveValue != null ? `${liveValue.toFixed(1)} ppm` : "—"}
            sub={liveLabel ?? "ไม่มีข้อมูล"}
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
              <p className="text-xs text-text-muted">{new Date(liveReading.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">{liveReading.acetone_delta.toFixed(1)} ppm</p>
              <p className="text-xs text-text-muted mt-0.5">Quality: {liveReading.quality_score?.toFixed(0)}/100</p>
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
