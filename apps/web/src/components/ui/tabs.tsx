"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

const TabsCtx = createContext<{
  active: string;
  setActive: (v: string) => void;
}>({ active: "", setActive: () => {} });

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsCtx.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={twMerge(
        "flex gap-1 rounded-xl bg-muted-bg p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const { active, setActive } = useContext(TabsCtx);
  const isActive = active === value;
  return (
    <button
      onClick={() => setActive(value)}
      className={twMerge(
        "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        isActive
          ? "bg-white text-mint-600 shadow-sm"
          : "text-muted hover:text-gray-700"
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { active } = useContext(TabsCtx);
  if (active !== value) return null;
  return <div className={className}>{children}</div>;
}
