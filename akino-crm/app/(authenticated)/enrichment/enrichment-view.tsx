"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  FolderOpen,
  CheckCircle2,
  Clock,
  Circle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { BatchStatus } from "@/lib/types";
import type { FolderBatchGroup } from "./actions";

const STATUS_META: Record<
  BatchStatus,
  { label: string; tone: "neutral" | "accent" | "success"; Icon: React.ElementType }
> = {
  not_started: { label: "Not Started", tone: "neutral", Icon: Circle },
  in_progress: { label: "In Progress", tone: "accent", Icon: Clock },
  complete: { label: "Complete", tone: "success", Icon: CheckCircle2 },
};

export function EnrichmentView({ groups }: { groups: FolderBatchGroup[] }) {
  const [filter, setFilter] = useState<"all" | BatchStatus>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(folderId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // Filter batches within each group
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      batches:
        filter === "all"
          ? g.batches
          : g.batches.filter((b) => b.status === filter),
    }))
    .filter((g) => g.batches.length > 0);

  const totalBatches = groups.reduce((sum, g) => sum + g.batches.length, 0);

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
              {totalBatches} batch{totalBatches !== 1 ? "es" : ""} across{" "}
              {groups.length} folder{groups.length !== 1 ? "s" : ""}
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

        {/* Folder-grouped batches */}
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-(--color-surface-4) flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-(--color-fg-subtle)" />
            </div>
            <p className="text-sm text-(--color-fg-muted)">
              {totalBatches === 0
                ? "No enrichment batches yet. Open a lead folder and click \"Create Enrichment Batch\" to get started."
                : "No batches match the current filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredGroups.map((group) => {
              const isCollapsed = collapsed.has(group.folder_id);
              const folderTotal = group.batches.reduce(
                (sum, b) => sum + b.total,
                0
              );
              const folderCompleted = group.batches.reduce(
                (sum, b) => sum + b.completed,
                0
              );
              const folderPct =
                folderTotal > 0
                  ? Math.round((folderCompleted / folderTotal) * 100)
                  : 0;

              return (
                <div
                  key={group.folder_id}
                  className="rounded-3xl bg-(--color-surface-1) border border-(--color-card-border) shadow-(--shadow-card) overflow-hidden"
                >
                  {/* Folder header */}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(group.folder_id)}
                    className="w-full flex items-center gap-4 px-8 py-5 hover:bg-(--color-surface-2)/50 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                    )}
                    <div className="h-10 w-10 rounded-xl bg-(--color-surface-4) flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-(--color-accent)" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-lg font-bold text-(--color-fg)">
                        {group.folder_name}
                      </h3>
                      <p className="text-sm text-(--color-fg-muted)">
                        {group.batches.length} batch
                        {group.batches.length !== 1 ? "es" : ""} ·{" "}
                        {folderCompleted}/{folderTotal} leads enriched ({folderPct}
                        %)
                      </p>
                    </div>
                    {/* Folder-level progress */}
                    <div className="w-32 hidden md:block">
                      <div className="h-1.5 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            folderPct === 100
                              ? "bg-emerald-500"
                              : "bg-(--color-accent)"
                          )}
                          style={{ width: `${folderPct}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Batches */}
                  {!isCollapsed && (
                    <div className="px-6 pb-6">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {group.batches.map((batch) => {
                          const meta = STATUS_META[batch.status];
                          const Icon = meta.Icon;
                          const pct =
                            batch.total > 0
                              ? Math.round(
                                  (batch.completed / batch.total) * 100
                                )
                              : 0;

                          return (
                            <Link
                              key={batch.id}
                              href={`/enrichment/${batch.id}`}
                              className="bg-(--color-surface-2) rounded-2xl p-6 flex flex-col gap-4 group/card hover:-translate-y-0.5 transition-all duration-200 hover:shadow-md relative overflow-hidden"
                            >
                              <div className="flex items-start justify-between">
                                <div className="w-9 h-9 rounded-full bg-(--color-surface-4) flex items-center justify-center">
                                  <Sparkles className="h-4 w-4 text-(--color-accent)" />
                                </div>
                                <Badge tone={meta.tone}>
                                  <Icon className="h-3 w-3" /> {meta.label}
                                </Badge>
                              </div>

                              <div>
                                <h4 className="text-base font-bold text-(--color-fg) mb-0.5">
                                  {batch.name}
                                </h4>
                                <p className="text-xs text-(--color-fg-muted)">
                                  {relativeTime(batch.created_at)}
                                </p>
                              </div>

                              {/* Stats */}
                              <div className="flex gap-4 text-sm">
                                <div>
                                  <span className="text-(--color-fg-subtle) text-xs">
                                    Total
                                  </span>
                                  <p className="font-bold text-(--color-fg)">
                                    {batch.total}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-(--color-fg-subtle) text-xs">
                                    Done
                                  </span>
                                  <p className="font-bold text-(--color-fg)">
                                    {batch.completed}
                                  </p>
                                </div>
                              </div>

                              {/* Progress */}
                              <div className="mt-auto">
                                <div className="flex justify-between text-xs text-(--color-fg-subtle) mb-1.5">
                                  <span>{pct}%</span>
                                </div>
                                <div className="h-1 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      pct === 100
                                        ? "bg-emerald-500"
                                        : "bg-(--color-accent)"
                                    )}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
