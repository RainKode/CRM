import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-(--color-accent) text-(--color-accent-fg) shadow-(--shadow-btn) hover:bg-(--color-accent-hover) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)",
        secondary:
          "bg-(--color-surface-2) text-(--color-fg) border border-(--color-border) shadow-(--shadow-btn) hover:bg-(--color-surface-3) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)",
        tertiary:
          "bg-(--color-tertiary) text-(--color-tertiary-fg) shadow-(--shadow-btn) hover:bg-(--color-tertiary-hover) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)",
        ghost:
          "text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) hover:-translate-y-0.5 active:translate-y-0",
        outline:
          "border border-(--color-border) text-(--color-fg) shadow-(--shadow-btn) hover:bg-(--color-surface-2) hover:border-(--color-border-strong) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)",
        danger:
          "bg-red-600 text-(--color-accent-fg) shadow-(--shadow-btn) hover:bg-red-700 hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)",
        link:
          "text-(--color-accent-text) hover:underline underline-offset-4 p-0 h-auto",
      },
      size: {
        sm: "h-8 rounded-full px-4 text-xs",
        md: "h-10 rounded-full px-6",
        lg: "h-12 rounded-full px-8",
        icon: "h-10 w-10 rounded-full",
        pill: "h-10 rounded-full px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
