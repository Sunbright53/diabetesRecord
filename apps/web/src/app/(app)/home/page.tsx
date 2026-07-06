"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream, type LiveReading } from "@/lib/useDeviceStream";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Activity, BookOpen, Droplets, Flame, LineChart, Scale, TestTube, Trophy, Wind,
} from "lucide-react";

const LABEL_COLOR: Record<string, string> = {
  low: "text-mint-700 bg-mint-50 border-mint-200",
  moderate: "text-amber-700 bg-amber-50 border-amber-200",
  high: "text-red-700 bg-red-50 border-red-200",
  unreliable: "text-gray-500 bg-gray-50 border-gray-200",
};

const LABEL_TH: Record<string, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  unreliable: "ไม่น่าเชื่อถือ",
};

function LiveAcetoneCard({ reading, connected }: { reading: LiveReading | null; connected: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-muted font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Wind size={11} className="text-mint-500" />
              Breath Acetone (Live)
            </p>
            <p className="stat-display text-4xl text-charcoal-500 mt-1.5">
              {reading ? reading.acetone_delta.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-muted mt-0.5">ppm</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${connected ? "text-mint-700 bg-mint-50 border-mint-200" : "text-gray-400 bg-gray-50 border-gray-200"}`}>
              {connected ? "● Live" : "○ ไม่ได้เชื่อมต่อ"}
            </span>
            {reading && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${LABEL_COLOR[reading.label] ?? LABEL_COLOR.unreliable}`}>
                {LABEL_TH[reading.label] ?? reading.label}
              </span>
            )}
          </div>
        </div>
        {reading && (
          <div className="flex gap-3 text-xs text-muted">
            <span>Quality: <span className="text-charcoal-500 font-medium">{reading.quality_score.toFixed(0)}/100</span></span>
            <span>Confidence: <span className="text-charcoal-500 font-medium">{(reading.confidence_score * 100).toFixed(0)}%</span></span>
            <span className="ml-auto text-[10px]">{new Date(reading.time).toLocaleTimeString("th-TH")}</span>
          </div>
        )}
        {!reading && (
          <p className="text-xs text-muted mt-1">
            {connected ? "รอข้อมูลจากอุปกรณ์..." : <Link href="/me/device" className="underline text-mint-600">จับคู่ MetaBreath Device</Link>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function KetoneStatus({ value }: { value: number }) {
  const { t } = useT();
  if (value < 0.5)  return <Badge variant="gray">{t("home.ketoseStatus.below")}</Badge>;
  if (value < 1.5)  return <Badge variant="mint">{t("home.ketoseStatus.nutritional")}</Badge>;
  if (value < 3.0)  return <Badge variant="peach">{t("home.ketoseStatus.optimal")}</Badge>;
  return <Badge variant="peach">{t("home.ketoseStatus.deep")}</Badge>;
}

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const name = user?.profile?.display_name ?? user?.username ?? t("common.unknown");
  const { reading: liveReading, connected: liveConnected } = useDeviceStream(user?.id);

  const { data: ketone } = useQuery({
    queryKey: ["ketone", "recent"],
    queryFn: () => api.logs.getKetone({ days: 1 }),
  });

  const { data: weight } = useQuery({
    queryKey: ["weight", "recent"],
    queryFn: () => api.logs.getWeight({ days: 3 }),
  });

  const { data: xp } = useQuery({ queryKey: ["me", "xp"], queryFn: api.gamification.getXP });
  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: quests } = useQuery({ queryKey: ["me", "quests"], queryFn: api.gamification.getQuestsToday });

  const latestKetone = ketone?.[ketone.length - 1];
  const latestWeight = weight?.[weight.length - 1];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("greeting.morning") : hour < 17 ? t("greeting.afternoon") : t("greeting.evening");

  const dateLocale = locale === "th" ? "th-TH" : "en-US";

  const QUEST_ICONS: Record<string, React.ElementType> = {
    daily_ketone: TestTube,
    daily_weight: Scale,
    daily_article: BookOpen,
    daily_exercise: Activity,
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">
          {greeting}, {name}
        </h1>
        <p className="text-sm text-muted mt-1">
          {new Date().toLocaleDateString(dateLocale, {
            weekday: "long", day: "numeric", month: "long",
          })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Ketone card */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted font-medium uppercase tracking-wider">{t("home.ketone")}</p>
                <p className="stat-display text-4xl text-charcoal-500 mt-1.5">
                  {latestKetone ? latestKetone.value_mmol.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted mt-0.5">mmol/L</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-mint-50 border border-mint-100 flex items-center justify-center">
                <Droplets size={16} className="text-mint-600" strokeWidth={1.6} />
              </div>
            </div>
            {latestKetone && (
              <div className="mt-3">
                <KetoneStatus value={latestKetone.value_mmol} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weight card */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted font-medium uppercase tracking-wider">{t("home.weight")}</p>
                <p className="stat-display text-4xl text-charcoal-500 mt-1.5">
                  {latestWeight ? latestWeight.kg.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted mt-0.5">kg</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-mint-50 border border-mint-100 flex items-center justify-center">
                <Scale size={16} className="text-mint-600" strokeWidth={1.6} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live acetone reading from MetaBreath device */}
      <LiveAcetoneCard reading={liveReading} connected={liveConnected} />

      {/* Streak */}
      <Card>
        <CardContent className="py-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gold-50 border border-gold-100 flex items-center justify-center">
            <Flame size={20} className="text-gold-500" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-xs text-muted font-medium uppercase tracking-wider">{t("home.streakOngoing")}</p>
            <p className="stat-display text-xl text-charcoal-500 mt-0.5">
              {streak?.current ?? 0} <span className="text-sm text-muted font-sans">{t("home.days")}</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-gold-700">
            <Trophy size={14} strokeWidth={1.6} />
            <span className="text-sm font-medium">{xp?.total ?? 0} XP</span>
          </div>
        </CardContent>
      </Card>

      {/* Daily quests */}
      {quests && quests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-charcoal-500 tracking-tight">{t("home.dailyQuests")}</h2>
            <Badge variant="mint">
              {quests.filter(q => q.completed_at).length} / {quests.length} {t("home.done")}
            </Badge>
          </div>
          <div className="space-y-2">
            {quests.map((quest) => {
              const Icon = QUEST_ICONS[quest.code] ?? TestTube;
              const done = !!quest.completed_at;
              return (
                <Card key={quest.id}>
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-surface-2 border border-border-soft flex items-center justify-center">
                      <Icon size={16} className="text-charcoal-500/70" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-charcoal-500">{quest.title}</p>
                      <p className="text-xs text-gold-700 mt-0.5">+{quest.xp_reward} XP</p>
                    </div>
                    <div className={`h-5 w-5 rounded-full border transition-colors ${done ? "bg-mint-500 border-mint-500" : "border-border"}`} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold text-charcoal-500 mb-3 tracking-tight">{t("home.quickLog")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/log?tab=ketone">
            <Button variant="outline" size="lg" className="w-full gap-2">
              <Droplets size={16} strokeWidth={1.6} /> {t("home.logKetone")}
            </Button>
          </Link>
          <Link href="/log?tab=weight">
            <Button variant="outline" size="lg" className="w-full gap-2">
              <Scale size={16} strokeWidth={1.6} /> {t("home.logWeight")}
            </Button>
          </Link>
          <Link href="/log?tab=activity">
            <Button variant="ghost" size="lg" className="w-full gap-2">
              <Activity size={16} strokeWidth={1.6} /> {t("home.activity")}
            </Button>
          </Link>
          <Link href="/trends">
            <Button variant="ghost" size="lg" className="w-full gap-2">
              <LineChart size={16} strokeWidth={1.6} /> {t("home.viewTrends")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
