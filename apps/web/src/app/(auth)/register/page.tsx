"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";
import { Leaf, Clock, Dumbbell, LineChart, type LucideIcon } from "lucide-react";

const GOALS: { value: string; Icon: LucideIcon }[] = [
  { value: "keto",     Icon: Leaf },
  { value: "fasting",  Icon: Clock },
  { value: "exercise", Icon: Dumbbell },
  { value: "monitor",  Icon: LineChart },
];

const schema = z.object({
  username:     z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email:        z.string().email(),
  password:     z.string().min(8),
  display_name: z.string().min(1),
  goal_types:   z.array(z.string()).min(1),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: authRegister } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { goal_types: [] },
  });

  const selectedGoals = watch("goal_types");

  const toggleGoal = (value: string) => {
    const current = selectedGoals ?? [];
    const next = current.includes(value)
      ? current.filter((g) => g !== value)
      : [...current, value];
    setValue("goal_types", next, { shouldValidate: true });
  };

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await authRegister({
        username:     data.username,
        email:        data.email,
        password:     data.password,
        display_name: data.display_name,
        goal_type:    data.goal_types[0],
      });
      router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.registerFailed"));
    }
  };

  const fieldErr = (k: keyof FormData): string | undefined => {
    if (!errors[k]) return undefined;
    switch (k) {
      case "username":
        return errors.username?.type === "too_small"
          ? t("auth.err.usernameMin")
          : t("auth.err.usernamePattern");
      case "email":         return t("auth.err.emailInvalid");
      case "password":      return t("auth.err.passwordMin");
      case "display_name":  return t("auth.err.displayNameRequired");
      case "goal_types":    return t("auth.err.goalRequired");
      default:              return undefined;
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1 tracking-tight">{t("auth.registerTitle")}</h2>
        <p className="text-sm text-muted mb-6">{t("auth.registerWelcome")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("auth.username")}
              placeholder="john_doe"
              autoComplete="username"
              error={fieldErr("username")}
              {...register("username")}
            />
            <Input
              label={t("auth.displayName")}
              placeholder="John"
              error={fieldErr("display_name")}
              {...register("display_name")}
            />
          </div>
          <Input
            label={t("auth.email")}
            type="email"
            placeholder="john@example.com"
            autoComplete="email"
            error={fieldErr("email")}
            {...register("email")}
          />
          <Input
            label={t("auth.password")}
            type="password"
            placeholder={t("auth.passwordHint")}
            autoComplete="new-password"
            error={fieldErr("password")}
            {...register("password")}
          />

          {/* Goal type */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900/80">{t("auth.goalPrompt")}</p>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map(({ value, Icon }) => {
                const label = t(`goal.${value}`);
                const desc = t(`goal.${value}Desc`);
                const active = (selectedGoals ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleGoal(value)}
                    className={twMerge(
                      "rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-mint-500 bg-mint-50/50 ring-2 ring-mint-500/15"
                        : "border-border-soft hover:border-mint-300/70 hover:bg-mint-50/30"
                    )}
                  >
                    <Icon size={18} className={active ? "text-mint-600" : "text-gray-900/70"} strokeWidth={1.6} />
                    <p className="text-sm font-medium text-gray-900 mt-2">{label}</p>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed">{desc}</p>
                  </button>
                );
              })}
            </div>
            {errors.goal_types && (
              <p className="text-xs text-red-500">{t("auth.err.goalRequired")}</p>
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.registerSubmitting") : t("auth.registerSubmit")}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-mint-600 hover:underline">
            {t("auth.loginSubmit")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
