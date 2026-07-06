import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        mint:   "bg-mint-100 text-mint-700",
        peach:  "bg-peach-100 text-peach-700",
        gray:   "bg-muted-bg text-muted",
        red:    "bg-red-100 text-red-700",
        yellow: "bg-yellow-100 text-yellow-700",
      },
    },
    defaultVariants: { variant: "mint" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={twMerge(badgeVariants({ variant }), className)} {...props} />
  );
}
