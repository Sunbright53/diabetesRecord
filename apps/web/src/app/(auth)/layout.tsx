"use client";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useT();

  useEffect(() => {
    if (!loading && user) {
      router.replace(
        user.profile?.onboarded_at ? "/home" : "/onboarding"
      );
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border-soft bg-white mb-4 shadow-[0_1px_2px_rgba(20,20,20,0.03)]">
            <BrandMark className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">{t("app.name")}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
