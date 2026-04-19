import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
  {
    variants: {
      tone: {
        neutral: "bg-(--color-surface-3) text-(--color-fg-muted)",
        accent: "bg-(--color-accent)/15 text-(--color-accent-text)",
        success: "bg-emerald-500/15 text-emerald-400",
        warn: "bg-amber-500/15 text-amber-400",
        danger: "bg-red-500/15 text-red-400",
        info: "bg-blue-500/15 text-blue-400",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
