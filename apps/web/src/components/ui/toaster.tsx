"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

let _toast: ToastContextValue["toast"] = () => {};

export function useToast() {
  return useContext(ToastCtx);
}

export function toast(message: string, type: Toast["type"] = "info") {
  _toast(message, type);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  _toast = addToast;

  const dismiss = (id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ toast: addToast }}>
      <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 md:bottom-6 md:right-6 md:left-auto md:translate-x-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={twMerge(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg min-w-64 max-w-80",
              t.type === "success" && "bg-mint-500",
              t.type === "error" && "bg-red-500",
              t.type === "info" && "bg-gray-800"
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
