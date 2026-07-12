"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand/logo";
import { LangSwitcher } from "@/components/lang-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(
        user.profile?.onboarded_at ? "/home" : "/onboarding"
      );
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center p-6"
      style={{
        backgroundImage: "url('/auth-bg.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark scrim over background image */}
      <div className="absolute inset-0 bg-slate-950/52" />

      <LangSwitcher />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand section */}
        <div className="mb-10 flex flex-col items-center text-center select-none">
          {/* Logo mark — glass ring with mint glow */}
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm shadow-[0_0_28px_rgba(0,200,150,0.28)]">
            <BrandMark className="h-9 w-9 text-mint-400" />
          </div>

          {/* App name: META heavy sans-serif + Breath italic display serif */}
          <div className="leading-[1.05]">
            <span className="block text-[3.25rem] font-black uppercase tracking-tight text-white">
              Meta
            </span>
            <span className="block font-display text-[2.6rem] font-bold italic tracking-[0.08em] text-mint-400">
              Breath
            </span>
          </div>

          <p className="mt-3 text-[10px] font-medium tracking-[0.28em] uppercase text-white/38">
            Metabolic Intelligence
          </p>
        </div>

        {/* Login / Register card — strong elevation shadow */}
        <div className="overflow-hidden rounded-3xl shadow-[0_28px_64px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)]">
          {children}
        </div>
      </div>
    </div>
  );
}
