"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { th, type Dict } from "@/i18n/locales/th";
import { en } from "@/i18n/locales/en";

export type Locale = "th" | "en";

const DICTS: Record<Locale, Dict> = { th, en };

type Vars = Record<string, string | number>;

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, vars?: Vars) => string;
};

const LocaleCtx = createContext<Ctx | null>(null);

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "th";
  const primary = (navigator.language || "en").toLowerCase();
  return primary.startsWith("th") ? "th" : "en";
}

function getFromDict(dict: unknown, path: string): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("th");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("locale")) as Locale | null;
    const resolved: Locale = saved === "th" || saved === "en" ? saved : detectBrowserLocale();
    setLocaleState(resolved);
    document.documentElement.lang = resolved;
    setReady(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (path: string, vars?: Vars) => interpolate(getFromDict(DICTS[locale], path), vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  if (!ready) return null;
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useT() {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error("useT must be used within LocaleProvider");
  return ctx;
}
