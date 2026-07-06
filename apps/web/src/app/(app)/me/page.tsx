"use client";

import { useQuery } from "@tanstack/react-query";
import { api, XPOut, StreakOut, BadgeOut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, User, Flame, Star, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";

const XP_PER_LEVEL = 100;

function LevelBar({ xp }: { xp: XPOut }) {
  const pct = Math.round((xp.xp_in_level / XP_PER_LEVEL) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Lv.{xp.level} — {xp.level_name}</span>
        <span>{xp.xp_in_level} / {XP_PER_LEVEL} XP</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-600 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StreakDots({ streak }: { streak: StreakOut }) {
  const { t } = useT();
  const days = Array.from({ length: 7 }, (_, i) => {
    const active = streak.current > 0 && i < Math.min(streak.current, 7);
    return active;
  });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted font-medium uppercase tracking-wider">{t("me.last7days")}</p>
      <div className="flex gap-1.5">
        {days.map((active, i) => (
          <div
            key={i}
            className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
              active
                ? "bg-peach-100 border border-peach-200 text-peach-700"
                : "bg-surface-2 border border-border-soft text-muted"
            }`}
          >
            {active ? "🔥" : "·"}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MePage() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const router = useRouter();

  const { data: xp } = useQuery({ queryKey: ["me", "xp"], queryFn: api.gamification.getXP });
  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: badges } = useQuery({ queryKey: ["me", "badges"], queryFn: api.gamification.getBadges });

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const goalKey = user?.profile?.goal_type ?? "monitor";

  return (
    <div className="max-w-lg mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">{t("me.title")}</h1>

      {/* Avatar + name */}
      <Card>
        <CardContent className="pt-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-mint-50 border border-mint-100 flex items-center justify-center text-xl text-mint-700 font-semibold">
            {user?.profile?.display_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-semibold text-charcoal-500 tracking-tight">
              {user?.profile?.display_name ?? user?.username}
            </p>
            <p className="text-sm text-muted mt-0.5">@{user?.username}</p>
          </div>
        </CardContent>
      </Card>

      {/* XP level bar */}
      {xp && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Star size={15} className="text-gold-500" strokeWidth={1.6} />
              <p className="text-xs font-medium text-muted uppercase tracking-wider">{t("me.stats.xp")}</p>
              <span className="ml-auto text-sm font-semibold text-charcoal-500">{xp.total.toLocaleString()} XP</span>
            </div>
            <LevelBar xp={xp} />
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="stat-display text-3xl text-charcoal-500">{streak?.current ?? 0}</p>
            <p className="text-xs text-muted mt-1 uppercase tracking-wider">{t("me.stats.streak")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="stat-display text-3xl text-charcoal-500">{streak?.longest ?? 0}</p>
            <p className="text-xs text-muted mt-1 uppercase tracking-wider">{t("me.stats.longest")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="stat-display text-3xl text-charcoal-500">{badges?.length ?? 0}</p>
            <p className="text-xs text-muted mt-1 uppercase tracking-wider">{t("me.stats.badge")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Streak dots */}
      {streak && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Flame size={15} className="text-peach-500" strokeWidth={1.6} />
              <p className="text-xs font-medium text-muted uppercase tracking-wider">{t("me.streakHistory")}</p>
              <span className="ml-auto text-xs text-muted">{t("me.freezesLeft", { n: streak.freezes_left })}</span>
            </div>
            <StreakDots streak={streak} />
          </CardContent>
        </Card>
      )}

      {/* Badges */}
      {badges && badges.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={15} className="text-gold-500" strokeWidth={1.6} />
            <h2 className="font-semibold text-charcoal-500 tracking-tight">{t("me.badges")}</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {badges.map((b) => (
              <Card key={b.code}>
                <CardContent className="pt-3 pb-3 text-center space-y-1">
                  <p className="text-2xl">{b.icon}</p>
                  <p className="text-xs font-medium text-charcoal-500 leading-tight">{b.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Goal */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted font-medium mb-2 uppercase tracking-wider">{t("me.goal")}</p>
          <Badge variant="mint" className="text-sm px-3 py-1">
            {t(`goal.${goalKey}`)}
          </Badge>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="lg"
          className="w-full gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut size={16} strokeWidth={1.6} /> {t("auth.logout")}
        </Button>
      </div>
    </div>
  );
}
