"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";
import { BrandMark } from "@/components/brand/logo";
import { Leaf, Clock, Dumbbell, LineChart, Bell, type LucideIcon } from "lucide-react";

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
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<BodyData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bodySchema) as any,
  });

  const goal = user?.profile?.goal_type ?? "monitor";
  const GoalIcon = GOAL_ICON[goal] ?? LineChart;
  const tip = t(`goal.${goal}Tip`);

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
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border-soft bg-white mb-4 shadow-[0_1px_2px_rgba(20,20,20,0.03)]">
            <BrandMark className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">{t("onboarding.welcome")}</h1>
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
          <div className="rounded-2xl bg-white border border-border-soft shadow-[0_1px_2px_rgba(20,20,20,0.03)] p-6 space-y-5">
            <div className="text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-50 border border-mint-100">
                <GoalIcon size={26} className="text-mint-600" strokeWidth={1.4} />
              </div>
              <h2 className="text-lg font-semibold text-charcoal-500 mt-4 tracking-tight">{t("onboarding.yourGoal")}</h2>
              <p className="text-sm text-muted mt-2 leading-relaxed">{tip}</p>
            </div>
            <div className="rounded-xl bg-mint-50/50 border border-mint-100 p-4 text-center">
              <p className="text-sm font-medium text-mint-700">
                {t("onboarding.selectedGoal")}: <span className="capitalize">{goal}</span>
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep(1)}>
              {t("common.next")}
            </Button>
          </div>
        )}

        {/* Step 1: Body metrics */}
        {step === 1 && (
          <div className="rounded-2xl bg-white border border-border-soft shadow-[0_1px_2px_rgba(20,20,20,0.03)] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-charcoal-500 tracking-tight">{t("onboarding.bodyTitle")}</h2>
            <p className="text-sm text-muted">{t("onboarding.bodyHint")}</p>

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
            <Input
              label={t("onboarding.dob")}
              type="date"
              {...register("dob")}
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-charcoal-500/80">{t("onboarding.sex")}</p>
              <div className="flex gap-2">
                {(["male","female","other"] as const).map((s) => (
                  <label
                    key={s}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-soft py-2 text-sm has-[:checked]:border-mint-500 has-[:checked]:bg-mint-50/50 has-[:checked]:text-mint-700"
                  >
                    <input type="radio" value={s} className="sr-only" {...register("sex")} />
                    {t(`onboarding.${s}`)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setStep(0)}>
                {t("common.back")}
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
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
              <h2 className="text-lg font-semibold text-charcoal-500 mt-4 tracking-tight">
                {t("onboarding.doneTitle")}
              </h2>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                {t("onboarding.doneSubtitle")}
              </p>
            </div>

            <div className="rounded-xl bg-gold-50 border border-gold-100 p-4">
              <p className="text-sm text-gold-700 font-medium text-center leading-relaxed">
                {t("onboarding.tip")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => setStep(1)}
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
