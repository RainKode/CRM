import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-11 w-full rounded-full border border-(--color-border) bg-white px-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:border-(--color-fg) focus:outline-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-[11px] font-extrabold uppercase tracking-[0.22px] text-(--color-fg-subtle)",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 rounded-full border border-(--color-border) bg-white px-4 pr-9 text-sm text-(--color-fg) focus:border-(--color-fg) focus:outline-none disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full rounded-2xl border border-(--color-border) bg-white px-4 py-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:border-(--color-fg) focus:outline-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
