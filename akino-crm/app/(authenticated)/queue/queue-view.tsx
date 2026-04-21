"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertTriangle,
  Calendar,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  Inbox,
  Mail,
  Phone,
  StickyNote,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  completeQueueItem,
  snoozeQueueItem,
  type QueueItem,
} from "./actions";

// Small click-outside dropdown (mirrors the one in pipeline-view.tsx).
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);
  return { open, setOpen, ref };
}

type Tab = "all" | "overdue" | "today" | "tasks" | "activities" | "follow_ups";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: Inbox },
  { id: "overdue", label: "Overdue", icon: AlertTriangle },
  { id: "today", label: "Today", icon: Calendar },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "activities", label: "Scheduled", icon: CalendarClock },
  { id: "follow_ups", label: "Follow-ups", icon: AlarmClock },
];

const SNOOZE_OPTIONS: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "2 weeks", days: 14 },
];

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(endToday);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const fmtTime = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (d < startToday) {
    // Overdue — show how many days ago
    const diff = Math.floor(
      (startToday.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === 0) return `Earlier today · ${fmtTime}`;
    if (diff === 1) return "Yesterday";
    return `${diff} days ago`;
  }
  if (d <= endToday) return `Today · ${fmtTime}`;
  if (d <= tomorrowEnd) return `Tomorrow · ${fmtTime}`;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconForItem(item: QueueItem): React.ElementType {
  if (item.kind === "task") return CheckSquare;
  if (item.kind === "follow_up") return AlarmClock;
  // scheduled_activity — icon by activity type
  switch (item.activity_type) {
    case "call":
      return Phone;
    case "email":
      return Mail;
    case "meeting":
      return CalendarClock;
    case "note":
      return StickyNote;
    default:
      return Clock;
  }
}

export function QueueView({ initialItems }: { initialItems: QueueItem[] }) {
  const [items, setItems] = useState<QueueItem[]>(initialItems);
  const [tab, setTab] = useState<Tab>("all");
  const [isPending, startTransition] = useTransition();
  const [cursorIndex, setCursorIndex] = useState(0);

  const filtered = useMemo(() => {
    switch (tab) {
      case "overdue":
        return items.filter((i) => i.overdue);
      case "today":
        return items.filter((i) => !i.overdue);
      case "tasks":
        return items.filter((i) => i.kind === "task");
      case "activities":
        return items.filter((i) => i.kind === "scheduled_activity");
      case "follow_ups":
        return items.filter((i) => i.kind === "follow_up");
      default:
        return items;
    }
  }, [items, tab]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      overdue: items.filter((i) => i.overdue).length,
      today: items.filter((i) => !i.overdue).length,
      tasks: items.filter((i) => i.kind === "task").length,
      activities: items.filter((i) => i.kind === "scheduled_activity").length,
      follow_ups: items.filter((i) => i.kind === "follow_up").length,
    };
  }, [items]);

  function handleComplete(item: QueueItem) {
    // Optimistic remove
    setItems((prev) =>
      prev.filter((i) => !(i.kind === item.kind && i.id === item.id))
    );
    startTransition(async () => {
      try {
        await completeQueueItem(item.kind, item.id);
      } catch {
        // Revert — easiest path is a full refresh; for now just re-add.
        setItems((prev) => [...prev, item]);
      }
    });
  }

  function handleSnooze(item: QueueItem, days: number) {
    setItems((prev) =>
      prev.filter((i) => !(i.kind === item.kind && i.id === item.id))
    );
    startTransition(async () => {
      try {
        await snoozeQueueItem(item.kind, item.id, days);
      } catch {
        setItems((prev) => [...prev, item]);
      }
    });
  }

  // Keep cursor in bounds as items are filtered/completed.
  useEffect(() => {
    if (cursorIndex >= filtered.length) {
      setCursorIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, cursorIndex]);

  // j/k navigation + x=complete, s=snooze tomorrow, Enter=open deal.
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false;
      return (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (filtered.length === 0) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursorIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursorIndex((i) => Math.max(0, i - 1));
        return;
      }
      const current = filtered[cursorIndex];
      if (!current) return;
      if (k === "x") {
        e.preventDefault();
        handleComplete(current);
        return;
      }
      if (k === "s") {
        e.preventDefault();
        handleSnooze(current, 1);
        return;
      }
      if (e.key === "Enter" && current.deal_id) {
        e.preventDefault();
        window.location.href = `/pipeline?deal=${current.deal_id}`;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, cursorIndex]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 md:px-12 pt-8 pb-6 border-b border-(--color-surface-4)">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-(--color-fg)">
              Follow-up Queue
            </h1>
            <p className="text-sm text-(--color-fg-muted)">
              Everything that needs you today — tasks, scheduled calls, and
              deal follow-ups in one place.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const count = counts[t.id];
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-(--color-accent)/10 text-(--color-accent)"
                    : "text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-surface-2)"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                      active
                        ? "bg-(--color-accent) text-(--color-accent-fg)"
                        : "bg-(--color-surface-3) text-(--color-fg-muted)"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-16 w-16 rounded-2xl bg-(--color-surface-2) flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-(--color-success)" />
            </div>
            <h2 className="text-lg font-bold text-(--color-fg) mb-1">
              {tab === "all" ? "Inbox zero" : "Nothing here"}
            </h2>
            <p className="text-sm text-(--color-fg-muted) max-w-md">
              {tab === "all"
                ? "You're all caught up. Schedule calls, set follow-ups, or create tasks to fill this queue."
                : "Switch tabs to see other kinds of items."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-3xl">
            {filtered.map((item, idx) => (
              <QueueRow
                key={`${item.kind}-${item.id}`}
                item={item}
                onComplete={() => handleComplete(item)}
                onSnooze={(days) => handleSnooze(item, days)}
                disabled={isPending}
                focused={idx === cursorIndex}
                onFocus={() => setCursorIndex(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({
  item,
  onComplete,
  onSnooze,
  disabled,
  focused,
  onFocus,
}: {
  item: QueueItem;
  onComplete: () => void;
  onSnooze: (days: number) => void;
  disabled: boolean;
  focused: boolean;
  onFocus: () => void;
}) {
  const Icon = iconForItem(item);
  const snooze = useDropdown();

  return (
    <div
      onMouseEnter={onFocus}
      className={cn(
        "group flex items-start gap-3 rounded-xl border-2 p-4 transition-colors",
        focused && "ring-2 ring-(--color-accent) ring-offset-2 ring-offset-(--color-bg)",
        item.overdue
          ? "border-(--color-danger)/30 bg-(--color-danger)/5"
          : "border-(--color-card-border) bg-(--color-surface-1) hover:bg-(--color-surface-2)"
      )}
    >
      {/* Complete checkbox */}
      <button
        type="button"
        onClick={onComplete}
        disabled={disabled}
        className={cn(
          "flex-none h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors",
          item.overdue
            ? "border-(--color-danger)/50 hover:bg-(--color-danger)/10 hover:border-(--color-danger)"
            : "border-(--color-surface-4) hover:bg-(--color-accent)/10 hover:border-(--color-accent)"
        )}
        title="Mark done"
      >
        <Check className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Kind icon */}
      <div
        className={cn(
          "flex-none h-6 w-6 rounded-md flex items-center justify-center",
          item.overdue
            ? "bg-(--color-danger)/10 text-(--color-danger)"
            : "bg-(--color-surface-3) text-(--color-fg-muted)"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-(--color-fg) truncate">
            {item.title}
          </span>
          {item.deal_id && item.deal_name && (
            <Link
              href="/pipeline"
              className="flex items-center gap-1 text-[11px] font-medium text-(--color-accent) hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Workflow className="h-3 w-3" />
              {item.deal_name}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-(--color-fg-muted)">
          <span
            className={cn(
              "flex items-center gap-1",
              item.overdue && "text-(--color-danger) font-medium"
            )}
          >
            <Clock className="h-3 w-3" />
            {formatDue(item.due_at)}
          </span>
          <span className="uppercase tracking-wider">
            {item.kind === "task"
              ? "Task"
              : item.kind === "scheduled_activity"
                ? item.activity_type
                : "Follow-up"}
          </span>
        </div>
        {item.subtitle && (
          <p className="mt-1 text-xs text-(--color-fg-muted) line-clamp-2">
            {item.subtitle}
          </p>
        )}
      </div>

      {/* Snooze dropdown */}
      <div className="relative" ref={snooze.ref}>
        <button
          type="button"
          onClick={() => snooze.setOpen(!snooze.open)}
          disabled={disabled}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-surface-3) transition-colors"
          title="Snooze"
        >
          <AlarmClock className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3" />
        </button>
        {snooze.open && (
          <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-popover) py-1 z-50">
            {SNOOZE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => {
                  snooze.setOpen(false);
                  onSnooze(opt.days);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-(--color-fg) hover:bg-(--color-surface-3) transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
