"use client";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PillNav } from "@/components/nav/PillNav";
import { FloatingAIButton } from "@/components/nav/FloatingAIButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useT();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.profile?.onboarded_at) { router.replace("/onboarding"); return; }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary">
      <PillNav />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <FloatingAIButton />
    </div>
  );
}
