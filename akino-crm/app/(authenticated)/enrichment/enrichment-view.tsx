"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  FolderOpen,
  Users,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { Batch, BatchStatus } from "@/lib/types";

const STATUS_META: Record<
  BatchStatus,
  { label: string; tone: "neutral" | "accent" | "success"; Icon: React.ElementType }
> = {
  not_started: { label: "Not Started", tone: "neutral", Icon: Circle },
  in_progress: { label: "In Progress", tone: "accent", Icon: Clock },
  complete: { label: "Complete", tone: "success", Icon: CheckCircle2 },
};

type BatchWithCounts = Batch & { total: number; completed: number };

export function EnrichmentView({
  initialBatches,
}: {
  initialBatches: BatchWithCounts[];
}) {
  const [filter, setFilter] = useState<"all" | BatchStatus>("all");

  const filtered =
    filter === "all"
      ? initialBatches
      : initialBatches.filter((b) => b.status === filter);

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-16 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
          <div>
            <h2 className="text-4xl md:text-[40px] font-bold text-(--color-fg) tracking-tight mb-2">
              Enrichment
            </h2>
            <p className="text-(--color-fg-muted) font-medium text-lg">
              Manage enrichment batches across all folders
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-8">
          {(["all", "not_started", "in_progress", "complete"] as const).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  filter === f
                    ? "bg-(--color-accent) text-(--color-accent-fg)"
                    : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
                )}
              >
                {f === "all" ? "All" : STATUS_META[f].label}
              </button>
            )
          )}
        </div>

        {/* Batch list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-(--color-surface-4) flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-(--color-fg-subtle)" />
            </div>
            <p className="text-sm text-(--color-fg-muted)">
              No enrichment batches yet. Create one from a lead folder.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((batch) => {
              const meta = STATUS_META[batch.status];
              const Icon = meta.Icon;
              const pct =
                batch.total > 0
                  ? Math.round((batch.completed / batch.total) * 100)
                  : 0;
              const isComplete = pct === 100 && batch.total > 0;

              return (
                <Link
                  key={batch.id}
                  href={`/enrichment/${batch.id}`}
                  className="bg-(--color-surface-1) rounded-[2rem] p-8 flex flex-col gap-6 group hover:-translate-y-1 transition-all duration-300 relative overflow-hidden shadow-(--shadow-card) border border-(--color-card-border) hover:shadow-(--shadow-card-hover)"
                >
                  {/* Hover gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent)/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  <div className="flex items-start justify-between relative z-10">
                    <div className="w-12 h-12 rounded-full bg-(--color-surface-4) flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-(--color-accent)" />
                    </div>
                    <Badge tone={meta.tone}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                  </div>

                  <div className="relative z-10">
                    <h3 className="text-[21px] font-bold text-(--color-fg) mb-1">
                      {batch.name}
                    </h3>
                    <p className="text-sm text-(--color-fg-muted) font-medium">
                      {relativeTime(batch.created_at)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 relative z-10">
                    <div className="bg-(--color-surface-2) p-4 rounded-xl">
                      <p className="text-xs text-(--color-fg-muted) uppercase tracking-wider font-semibold mb-1">
                        Total
                      </p>
                      <p className="text-xl font-bold text-(--color-fg)">
                        {batch.total}
                      </p>
                    </div>
                    <div className="bg-(--color-surface-2) p-4 rounded-xl">
                      <p className="text-xs text-(--color-fg-muted) uppercase tracking-wider font-semibold mb-1">
                        Done
                      </p>
                      <p className="text-xl font-bold text-(--color-fg)">
                        {batch.completed}
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="relative z-10 mt-auto pt-4">
                    <div className="flex justify-between text-xs text-(--color-fg-subtle) mb-2">
                      <span>{pct}% enriched</span>
                    </div>
                    <div className="h-1 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isComplete ? "bg-emerald-500" : "bg-(--color-accent)"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
