"use client";

import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";

export function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useT();
  return (
    <div
      className={twMerge(
        "fixed top-3 right-3 z-50 flex items-center rounded-full border border-border-soft bg-white/85 backdrop-blur-md px-0.5 py-0.5 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)] text-[11px] font-medium",
        className,
      )}
    >
      <button
        onClick={() => setLocale("th")}
        className={twMerge(
          "px-2.5 py-1 rounded-full transition-colors tracking-wide",
          locale === "th" ? "bg-mint-500 text-white" : "text-charcoal-500/50 hover:text-charcoal-500",
        )}
        aria-pressed={locale === "th"}
      >
        TH
      </button>
      <button
        onClick={() => setLocale("en")}
        className={twMerge(
          "px-2.5 py-1 rounded-full transition-colors tracking-wide",
          locale === "en" ? "bg-mint-500 text-white" : "text-charcoal-500/50 hover:text-charcoal-500",
        )}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
