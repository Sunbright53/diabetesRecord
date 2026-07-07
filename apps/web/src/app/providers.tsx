"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/toaster";
import { LangSwitcher } from "@/components/lang-switcher";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster as Sonner } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <LangSwitcher />
            {children}
            <Toaster />
            <Sonner
              theme="dark"
              toastOptions={{
                style: {
                  background: "#1F1F1F",
                  border: "1px solid #262626",
                  color: "#FAFAFA",
                },
              }}
            />
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
