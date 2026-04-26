"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export interface UserPickerOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role?: "manager" | "executive" | null;
}

export interface UserPickerProps {
  members: UserPickerOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  /** Show an "Unassigned" choice. Defaults to true. */
  allowUnassigned?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function UserPicker({
  members,
  value,
  onChange,
  allowUnassigned = true,
  placeholder = "Assign…",
  disabled,
  className,
  size = "md",
}: UserPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = members.find((m) => m.user_id === value) ?? null;
  const filtered = members.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (m.full_name ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  const sizeClasses = size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm";

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-surface-2) text-(--color-fg) hover:bg-(--color-surface-3) disabled:opacity-50 disabled:cursor-not-allowed",
          sizeClasses
        )}
      >
        {selected ? (
          <>
            <Avatar
              size="xs"
              userId={selected.user_id}
              name={selected.full_name}
              email={selected.email}
            />
            <span className="truncate max-w-[140px]">
              {selected.full_name ?? selected.email ?? "Member"}
            </span>
          </>
        ) : value === null ? (
          <>
            <Avatar size="xs" unassigned />
            <span className="text-(--color-fg-muted)">Unassigned</span>
          </>
        ) : (
          <span className="text-(--color-fg-muted)">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border border-(--color-border) bg-(--color-surface-1) shadow-lg">
          <div className="p-2 border-b border-(--color-border)">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="w-full bg-(--color-surface-2) rounded px-2 py-1 text-sm outline-none border border-(--color-border) focus:border-(--color-accent)"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {allowUnassigned && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--color-surface-2)"
                >
                  <Avatar size="xs" unassigned />
                  <span className="flex-1 text-left text-(--color-fg-muted)">
                    Unassigned
                  </span>
                  {value === null && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            )}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-(--color-fg-muted)">
                No members match.
              </li>
            )}
            {filtered.map((m) => (
              <li key={m.user_id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.user_id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--color-surface-2)"
                >
                  <Avatar
                    size="xs"
                    userId={m.user_id}
                    name={m.full_name}
                    email={m.email}
                  />
                  <span className="flex-1 text-left truncate">
                    {m.full_name ?? m.email ?? "Member"}
                  </span>
                  {m.role === "manager" && (
                    <span className="text-[9px] uppercase tracking-wide text-(--color-accent-text)">
                      MGR
                    </span>
                  )}
                  {value === m.user_id && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
          {value !== null && allowUnassigned && (
            <div className="p-1.5 border-t border-(--color-border)">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-(--color-fg-muted) hover:text-(--color-fg)"
              >
                <X className="h-3 w-3" /> Clear assignment
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
