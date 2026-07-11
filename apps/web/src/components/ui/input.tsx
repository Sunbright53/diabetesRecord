import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  rightElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, rightElement, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={twMerge(
              "h-11 w-full rounded-xl border border-border bg-bg-elevated text-text-primary px-4 text-sm outline-none transition placeholder:text-text-disabled",
              rightElement && "pr-11",
              "focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20",
              error && "border-red-400 focus:border-red-400 focus:ring-red-400/20",
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
