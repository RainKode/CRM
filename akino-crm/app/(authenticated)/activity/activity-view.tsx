"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Phone,
  Mail,
  StickyNote,
  ArrowRightLeft,
  CalendarClock,
  Trophy,
  XCircle,
  CheckCircle,
  Sparkles,
  Zap,
  FolderPlus,
  Trash2,
  Undo2,
  Activity,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import type { ActivityLogEntry } from "@/lib/types";
import Link from "next/link";

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  stage_change: ArrowRightLeft,
  follow_up_set: CalendarClock,
  won: Trophy,
  lost: XCircle,
  lead_enriched: Sparkles,
  enrichment_run_completed: Zap,
  enrichment_started: Zap,
  batch_created: FolderPlus,
  batch_deleted: Trash2,
  batch_restored: Undo2,
};

const CATEGORY_LABELS = {
  all: "All",
  pipeline: "Pipeline",
  enrichment: "Enrichment",
  batch: "Batches",
} as const;

type Category = keyof typeof CATEGORY_LABELS;

export function ActivityItemRow({ a }: { a: ActivityLogEntry }) {
  const Icon = ACTIVITY_ICON[a.action] ?? StickyNote;
  const isWon = a.action === "won";

  return (
    <div className="flex items-start gap-4 py-4 border-b border-(--color-border)/10 last:border-0">
      <div
        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          isWon ? "bg-(--color-blue)/12" : "bg-(--color-surface-3)"
        }`}
      >
        {isWon ? (
          <CheckCircle className="h-[18px] w-[18px] text-(--color-blue)" />
        ) : (
          <Icon className="h-[18px] w-[18px] text-(--color-fg-muted)" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <p className="text-sm font-medium text-(--color-fg) leading-snug">
          {a.summary}
        </p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide",
              a.category === "pipeline"
                ? "bg-(--color-blue)/12 text-(--color-blue)"
                : a.category === "enrichment"
                ? "bg-purple-500/10 text-purple-400"
                : "bg-emerald-500/10 text-emerald-400"
            )}
          >
            {a.category}
          </span>
          <span className="text-xs text-(--color-fg-muted)">
            {relativeTime(a.occurred_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ActivityView({
  activities,
  category,
  nextCursor,
}: {
  activities: ActivityLogEntry[];
  category: string;
  nextCursor: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setCategory(cat: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat === "all") params.delete("category");
    else params.set("category", cat);
    params.delete("cursor");
    router.push(`${pathname}?${params.toString()}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", nextCursor);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-4 px-8 md:px-12 h-24 shrink-0">
        <div className="h-10 w-10 rounded-xl bg-(--color-blue)/10 flex items-center justify-center">
          <Activity className="h-5 w-5 text-(--color-blue)" />
        </div>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight text-(--color-fg)">
            Activity
          </h1>
          <p className="text-sm text-(--color-fg-muted) mt-0.5">
            Full history of pipeline, enrichment, and batch events.
          </p>
        </div>
      </header>

      {/* Category filter chips */}
      <div className="px-8 md:px-12 border-b border-(--color-border)/15 flex gap-2 pb-3 shrink-0">
        {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full font-medium transition-colors",
              category === key
                ? "bg-(--color-accent) text-(--color-accent-fg)"
                : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 md:px-12 py-6">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-(--color-surface-2) flex items-center justify-center mb-4">
              <Activity className="h-7 w-7 text-(--color-fg-subtle)" />
            </div>
            <p className="text-sm font-medium text-(--color-fg)">No activity yet</p>
            <p className="text-xs text-(--color-fg-muted) mt-1">
              Events will appear here as you use the CRM.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl">
            {activities.map((a) => (
              <ActivityItemRow key={a.id} a={a} />
            ))}
            {nextCursor && (
              <div className="flex justify-center pt-6">
                <button
                  type="button"
                  onClick={loadMore}
                  className="text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors px-4 py-2 rounded-full border border-(--color-border) hover:bg-(--color-surface-2)"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
