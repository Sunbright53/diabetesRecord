"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <RadixDialog.Content
          className={twMerge(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-2rem)] max-w-md max-h-[80vh]",
            "flex flex-col rounded-2xl bg-white shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            className
          )}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <RadixDialog.Title className="text-base font-semibold text-gray-900">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </RadixDialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-3">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
