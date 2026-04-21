"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Phone, Mail, StickyNote, CalendarClock, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { logActivity } from "./actions";

type ActivityKind = "call" | "email" | "note" | "meeting";

const KIND_CONFIG: Record<
  ActivityKind,
  { label: string; icon: React.ElementType; accent: string }
> = {
  call: { label: "Call", icon: Phone, accent: "text-(--color-accent)" },
  email: { label: "Email", icon: Mail, accent: "text-(--color-accent)" },
  note: { label: "Note", icon: StickyNote, accent: "text-(--color-accent)" },
  meeting: {
    label: "Meeting",
    icon: CalendarClock,
    accent: "text-(--color-accent)",
  },
};

/**
 * Inline "Log activity" popover. Pops out below the trigger button, offers
 * quick-log for call/email/note with an optional summary and an optional
 * "schedule for later" toggle which flips status to "scheduled".
 */
export function QuickLogPopover({
  dealId,
  onClose,
  onLogged,
  anchorRect,
}: {
  dealId: string;
  onClose: () => void;
  onLogged?: () => void;
  anchorRect: { left: number; top: number; width: number };
}) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [summary, setSummary] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSchedule, setIsSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Esc
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const text = summary.trim() || KIND_CONFIG[kind].label;
        await logActivity({
          deal_id: dealId,
          type: kind,
          summary: text,
          status: isSchedule ? "scheduled" : "done",
          scheduled_at: isSchedule && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
        });
        onLogged?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to log");
      }
    });
  }

  // Position popover below the trigger, keeping it inside viewport.
  const MAX_W = 320;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - MAX_W - 8)
  );
  const top = anchorRect.top;

  return (
    <div
      ref={ref}
      className="fixed z-100 w-80 rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-popover) p-3"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
          Log activity
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 rounded-md text-(--color-fg-subtle) hover:text-(--color-fg) hover:bg-(--color-surface-3) flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Kind picker */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {(Object.keys(KIND_CONFIG) as ActivityKind[]).map((k) => {
          const cfg = KIND_CONFIG[k];
          const Icon = cfg.icon;
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-colors border",
                active
                  ? "bg-(--color-accent)/10 border-(--color-accent)/40 text-(--color-accent)"
                  : "bg-(--color-surface-2) border-transparent text-(--color-fg-muted) hover:bg-(--color-surface-3)"
              )}
            >
              <Icon className="h-4 w-4" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={`Quick ${KIND_CONFIG[kind].label.toLowerCase()} summary…`}
        rows={2}
        autoFocus
        className="w-full rounded-xl border-0 bg-(--color-surface-2) px-3 py-2 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none resize-none"
      />

      {/* Schedule toggle */}
      <label className="mt-2 flex items-center gap-2 text-xs text-(--color-fg-muted) cursor-pointer">
        <input
          type="checkbox"
          checked={isSchedule}
          onChange={(e) => setIsSchedule(e.target.checked)}
          className="accent-(--color-accent)"
        />
        Schedule for later
      </label>
      {isSchedule && (
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="mt-2 w-full rounded-xl border-0 bg-(--color-surface-2) px-3 py-2 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
        />
      )}

      {error && (
        <div className="mt-2 rounded-lg bg-(--color-danger)/10 px-3 py-2 text-[11px] text-(--color-danger)">
          {error}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-surface-3)"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || (isSchedule && !scheduledAt)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-accent) text-(--color-accent-fg) text-xs font-medium disabled:opacity-50 hover:bg-(--color-accent-hover) transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {isSchedule ? "Schedule" : "Log"}
        </button>
      </div>
    </div>
  );
}
