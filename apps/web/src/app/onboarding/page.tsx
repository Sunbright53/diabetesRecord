"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DobPicker } from "@/components/ui/dob-picker";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";
import { BrandMark } from "@/components/brand/logo";
import { Leaf, Clock, Dumbbell, LineChart, Bell, User, type LucideIcon } from "lucide-react";

const bodySchema = z.object({
  height_cm: z.coerce.number().min(100).max(250).optional(),
  weight_kg: z.coerce.number().min(20).max(300).optional(),
  dob:       z.string().optional(),
  sex:       z.enum(["male", "female", "other"]).optional(),
});
type BodyData = z.infer<typeof bodySchema>;

const GOAL_ICON: Record<string, LucideIcon> = {
  keto: Leaf, fasting: Clock, exercise: Dumbbell, monitor: LineChart,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { t, locale } = useT();
  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BodyData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bodySchema) as any,
  });

  const goal = user?.profile?.goal_type ?? "monitor";
  const GoalIcon = GOAL_ICON[goal] ?? LineChart;

  const [displayGoals, setDisplayGoals] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("signup_goals");
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      setDisplayGoals(parsed.length > 0 ? parsed : [goal]);
    } catch {
      setDisplayGoals([goal]);
    }
  }, [goal]);

  const steps = [t("onboarding.steps.goal"), t("onboarding.steps.body"), t("onboarding.steps.schedule")];

  const finish = async (data: BodyData) => {
    setSaving(true);
    try {
      await api.auth.updateProfile({
        ...data,
        onboarded_at: new Date().toISOString(),
      });
      await refreshUser();
      router.replace("/home");
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <BrandMark className="h-14 w-14 rounded-2xl mb-4 mx-auto block" />
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{t("onboarding.welcome")}</h1>
          <p className="text-sm text-muted mt-1">
            {t("onboarding.hello")}, {user?.profile?.display_name ?? user?.username}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={twMerge(
                  "h-1 w-full rounded-full transition-colors",
                  i <= step ? "bg-mint-500" : "bg-border"
                )}
              />
              <span className={twMerge("text-[11px]", i <= step ? "text-mint-700 font-medium" : "text-muted")}>
                {s}
              </span>
            </div>
          ))}
        </div>

        {/* Step 0: Goal confirm */}
        {step === 0 && (
          <div className="rounded-2xl bg-white border border-border-soft shadow-[0_4px_20px_rgba(72,199,140,0.08)] p-6 space-y-5">
            <div className="text-center space-y-4">
              <div className="relative inline-flex">
                <div className="h-20 w-20 flex items-center justify-center rounded-3xl bg-gradient-to-br from-mint-400/20 via-mint-100/40 to-mint-600/10 border border-mint-200/60 shadow-[0_6px_24px_rgba(72,199,140,0.18)]">
                  <GoalIcon size={36} className="text-mint-600" strokeWidth={1.4} />
                </div>
                <span className="absolute -top-1 -right-1 text-base">✨</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight leading-snug">
                {t("onboarding.tagline")}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-center">
              {displayGoals.map((g) => {
                const Icon = GOAL_ICON[g] ?? LineChart;
                return (
                  <div
                    key={g}
                    className="flex items-center gap-2 rounded-2xl bg-mint-50 border-2 border-mint-300 px-4 py-2.5 shadow-[0_2px_8px_rgba(72,199,140,0.15)]"
                  >
                    <Icon size={18} className="text-mint-600" strokeWidth={2} />
                    <span className="text-sm font-bold text-mint-700 tracking-tight">{t(`goal.${g}`)}</span>
                  </div>
                );
              })}
            </div>

            <Button size="lg" className="w-full" onClick={() => { setSubStep(0); setStep(1); }}>
              {t("common.next")}
            </Button>
          </div>
        )}

        {/* Step 1: Body metrics — one field group at a time */}
        {step === 1 && (
          <div className="rounded-2xl bg-white border border-border-soft shadow-[0_4px_20px_rgba(20,20,20,0.06)] p-6 space-y-5">
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-mint-50 to-mint-100/60 border border-mint-200/60 shadow-[0_4px_12px_rgba(72,199,140,0.12)]">
                <User size={28} className="text-mint-600" strokeWidth={1.4} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{t("onboarding.bodyTitle")}</h2>
                <p className="text-sm text-gray-500 mt-1">{t("onboarding.bodyHint")}</p>
              </div>
              {/* Sub-step dot indicators */}
              <div className="flex gap-1.5 justify-center pt-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={twMerge(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === subStep ? "w-6 bg-mint-500" : "w-1.5 bg-gray-200"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Content area — fixed min-height so card doesn't jump */}
            <div className="min-h-[120px] flex flex-col justify-center">
              {subStep === 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t("onboarding.height")}
                    type="number"
                    placeholder="170"
                    error={errors.height_cm?.message}
                    {...register("height_cm")}
                  />
                  <Input
                    label={t("onboarding.weight")}
                    type="number"
                    step="0.1"
                    placeholder="65"
                    error={errors.weight_kg?.message}
                    {...register("weight_kg")}
                  />
                </div>
              )}

              {subStep === 1 && (
                <DobPicker
                  label={t("onboarding.dob")}
                  value={watch("dob")}
                  onChange={(val) => setValue("dob", val)}
                  locale={locale as "en" | "th"}
                />
              )}

              {subStep === 2 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-900">{t("onboarding.sex")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["male", "female", "other"] as const).map((s) => (
                      <label
                        key={s}
                        className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-gray-200 py-3 text-sm font-medium text-gray-700 transition-colors has-[:checked]:border-mint-500 has-[:checked]:bg-mint-50 has-[:checked]:text-mint-700"
                      >
                        <input type="radio" value={s} className="sr-only" {...register("sex")} />
                        {t(`onboarding.${s}`)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => subStep === 0 ? setStep(0) : setSubStep((s) => s - 1)}
              >
                {t("common.back")}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => subStep < 2 ? setSubStep((s) => s + 1) : setStep(2)}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Schedule / done */}
        {step === 2 && (
          <form
            onSubmit={handleSubmit(finish)}
            className="rounded-2xl bg-white border border-border-soft shadow-[0_1px_2px_rgba(20,20,20,0.03)] p-6 space-y-5"
          >
            <div className="text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-50 border border-mint-100">
                <Bell size={24} className="text-mint-600" strokeWidth={1.4} />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mt-4 tracking-tight">
                {t("onboarding.doneTitle")}
              </h2>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                {t("onboarding.doneSubtitle")}
              </p>
            </div>

            <div className="rounded-xl bg-mint-50 border border-mint-200/60 p-4 space-y-3">
              <p className="text-xs font-bold text-mint-700 text-center uppercase tracking-widest">
                {t("onboarding.tipTitle")}
              </p>
              <div className="space-y-2">
                {([
                  { emoji: "🌅", key: "tipTime1" },
                  { emoji: "🍳", key: "tipTime2" },
                  { emoji: "⏱️", key: "tipTime3" },
                ] as const).map(({ emoji, key }) => (
                  <div key={key} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-mint-100 shadow-[0_1px_3px_rgba(72,199,140,0.08)]">
                    <span className="text-base leading-none">{emoji}</span>
                    <span className="text-sm font-medium text-gray-700">{t(`onboarding.${key}`)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-mint-600 font-medium text-center italic">
                {t("onboarding.tipFooter")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => { setStep(1); setSubStep(2); }}
              >
                {t("common.back")}
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={saving}>
                {saving ? t("common.saving") : t("onboarding.start")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
