import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold tracking-[0.12px] transition-[opacity,background,color,border] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-blue) focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-(--color-fg) text-white hover:opacity-85",
        secondary: "bg-(--color-surface-2) text-(--color-fg) hover:opacity-85",
        tertiary: "bg-white text-(--color-fg) border border-(--color-border) hover:bg-(--color-surface-2)",
        ghost: "text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)",
        outline: "bg-transparent text-(--color-fg) border-2 border-(--color-fg) hover:opacity-85",
        ghostDark: "bg-white/10 text-white border border-white/52 hover:opacity-85",
        danger: "bg-(--color-danger) text-white hover:opacity-90",
        link: "text-(--color-fg) underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-4 text-xs",
        md: "h-11 px-5",
        lg: "h-12 px-7",
        icon: "h-11 w-11",
        pill: "h-11 px-6",
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
