"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
};
const DialogContext = React.createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative z-10 w-full max-w-md">{children}</div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogContext);
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-(--color-fg)/10 bg-(--color-surface-1)",
        className
      )}
    >
      <button
        type="button"
        onClick={() => ctx?.setOpen(false)}
        className="absolute right-3 top-3 rounded-md p-1 text-(--color-fg-subtle) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 pt-6 pb-2">
      {children}
    </div>
  );
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold tracking-tight">{children}</h2>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm text-(--color-fg-muted)">{children}</p>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-6 py-4", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 px-6 pb-6 pt-2">
      {children}
    </div>
  );
}
