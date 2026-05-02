import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Deterministic color from a string (user_id or name) ───────────────
const PALETTE = [
  "bg-sky-500/20 text-sky-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-rose-500/20 text-rose-300",
  "bg-violet-500/20 text-violet-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-fuchsia-500/20 text-fuchsia-300",
  "bg-lime-500/20 text-lime-300",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name?.trim() || email?.trim() || "?").trim();
  if (!src || src === "?") return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  /** Render an "Unassigned" dashed-outline state. */
  unassigned?: boolean;
}

export function Avatar({
  userId,
  name,
  email,
  size = "sm",
  unassigned,
  className,
  title,
  ...props
}: AvatarProps) {
  if (unassigned) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-dashed border-(--color-border) text-(--color-fg-muted) font-semibold",
          SIZES[size],
          className
        )}
        title={title ?? "Unassigned"}
        {...props}
      >
        ?
      </span>
    );
  }
  const seed = userId ?? name ?? email ?? "?";
  const palette = PALETTE[hashString(seed) % PALETTE.length];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold",
        SIZES[size],
        palette,
        className
      )}
      title={title ?? name ?? email ?? undefined}
      {...props}
    >
      {initialsFor(name, email)}
    </span>
  );
}

export interface AvatarStackProps extends React.HTMLAttributes<HTMLDivElement> {
  members: { user_id?: string | null; name?: string | null; email?: string | null }[];
  max?: number;
  size?: AvatarSize;
}

export function AvatarStack({ members, max = 3, size = "sm", className, ...props }: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <div className={cn("flex items-center -space-x-1.5", className)} {...props}>
      {visible.map((m, i) => (
        <Avatar
          key={m.user_id ?? i}
          userId={m.user_id ?? undefined}
          name={m.name}
          email={m.email}
          size={size}
          className="border-2 border-(--color-bg)"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border-2 border-(--color-bg) bg-(--color-surface-3) text-(--color-fg-muted) font-semibold",
            SIZES[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
