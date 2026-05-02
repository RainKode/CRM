import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.16px]",
  {
    variants: {
      tone: {
        neutral: "bg-(--color-surface-2) text-(--color-fg)",
        accent: "bg-(--color-blue)/12 text-(--color-blue)",
        success: "bg-(--color-teal)/12 text-(--color-teal)",
        warn: "bg-(--color-warning)/12 text-(--color-warning)",
        danger: "bg-(--color-pink)/12 text-(--color-pink)",
        info: "bg-(--color-info)/12 text-(--color-info)",
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
