"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  FolderOpen,
  CheckCircle2,
  Clock,
  Circle,
  List,
  LayoutGrid,
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

// â”€â”€â”€ Main Enrichment View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function EnrichmentView({ groups }: { groups: FolderBatchGroup[] }) {
  const [filter, setFilter] = useState<"all" | BatchStatus>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Filter batches
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
      <div className="pt-8 pb-12 px-6 md:px-12 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
              Enrichment
            </h2>
            <p className="text-(--color-fg-muted) text-sm">
              {filteredGroups.reduce((s, g) => s + g.batches.length, 0)} batch
              {filteredGroups.reduce((s, g) => s + g.batches.length, 0) !== 1
                ? "es"
                : ""}
              {` across ${groups.length} folder${groups.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-xl bg-(--color-surface-2) p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-lg p-2 transition-all duration-200 cursor-pointer",
                  viewMode === "grid"
                    ? "bg-(--color-surface-3) text-(--color-fg) shadow-(--shadow-btn)"
                    : "text-(--color-fg-subtle) hover:text-(--color-fg) hover:-translate-y-0.5"
                )}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-lg p-2 transition-all duration-200 cursor-pointer",
                  viewMode === "list"
                    ? "bg-(--color-surface-3) text-(--color-fg) shadow-(--shadow-btn)"
                    : "text-(--color-fg-subtle) hover:text-(--color-fg) hover:-translate-y-0.5"
                )}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
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
                  "rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
                  filter === f
                    ? "bg-(--color-accent) text-(--color-accent-fg) shadow-(--shadow-btn) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)"
                    : "bg-(--color-surface-2) text-(--color-fg-muted) border border-(--color-border) shadow-(--shadow-btn) hover:bg-(--color-surface-3) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active)"
                )}
              >
                {f === "all" ? "All" : STATUS_META[f].label}
              </button>
            )
          )}
        </div>

        {/* Content */}
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-(--color-surface-4) flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-(--color-fg-subtle)" />
            </div>
            <p className="text-sm text-(--color-fg-muted)">
              {totalBatches === 0
                ? 'No enrichment batches yet. Open a lead folder and click "Create Enrichment Batch" to get started.'
                : "No batches match the current filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredGroups.map((group) => {
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
                <div key={group.folder_id}>
                  {/* Folder section header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-(--color-surface-4) flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-(--color-accent)" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-(--color-fg)">
                        {group.folder_name}
                      </h3>
                      <p className="text-xs text-(--color-fg-muted)">
                        {group.batches.length} batch
                        {group.batches.length !== 1 ? "es" : ""} Â·{" "}
                        {folderCompleted}/{folderTotal} enriched ({folderPct}%)
                      </p>
                    </div>
                    <div className="w-24">
                      <div className="h-1.5 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            folderPct === 100
                              ? "bg-(--color-success)"
                              : "bg-(--color-accent)"
                          )}
                          style={{ width: `${folderPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grid view */}
                  {viewMode === "grid" ? (
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
                            className="bg-(--color-surface-1) border border-(--color-card-border) rounded-2xl p-6 flex flex-col gap-4 group/card transition-all duration-200 shadow-(--shadow-card-3d) hover:shadow-(--shadow-card-3d-hover) hover:-translate-y-1 active:translate-y-0 active:shadow-(--shadow-btn-active)"
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
                              <h4 className="text-base font-bold text-(--color-fg) mb-0.5 break-words">
                                {batch.name}
                              </h4>
                              <p className="text-xs text-(--color-fg-muted)">
                                {relativeTime(batch.created_at)}
                              </p>
                            </div>
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
                            <div className="mt-auto">
                              <div className="flex justify-between text-xs text-(--color-fg-subtle) mb-1.5">
                                <span>{pct}%</span>
                              </div>
                              <div className="h-1 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    pct === 100
                                      ? "bg-(--color-success)"
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
                  ) : (
                    /* List view (compact) */
                    <div className="rounded-2xl border border-(--color-card-border) overflow-hidden shadow-(--shadow-card-3d)">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-(--color-surface-2) text-left text-xs uppercase tracking-wider text-(--color-fg-subtle)">
                            <th className="px-4 py-3 font-semibold">#</th>
                            <th className="px-4 py-3 font-semibold">
                              Batch Name
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              Status
                            </th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Progress
                            </th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Created
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.batches.map((batch, idx) => {
                            const meta = STATUS_META[batch.status];
                            const Icon = meta.Icon;
                            const pct =
                              batch.total > 0
                                ? Math.round(
                                    (batch.completed / batch.total) * 100
                                  )
                                : 0;

                            return (
                              <tr
                                key={batch.id}
                                className="border-t border-(--color-card-border) hover:bg-(--color-surface-2)/50 transition-colors"
                              >
                                <td className="px-4 py-3 text-(--color-fg-subtle)">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-3">
                                  <Link
                                    href={`/enrichment/${batch.id}`}
                                    className="font-medium text-(--color-fg) hover:text-(--color-accent) transition-colors"
                                  >
                                    {batch.name}
                                  </Link>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge tone={meta.tone}>
                                    <Icon className="h-3 w-3" /> {meta.label}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <span className="text-xs text-(--color-fg-muted)">
                                      {batch.completed}/{batch.total}
                                    </span>
                                    <div className="w-20 h-1 bg-(--color-surface-4) rounded-full overflow-hidden">
                                      <div
                                        className={cn(
                                          "h-full rounded-full",
                                          pct === 100
                                            ? "bg-(--color-success)"
                                            : "bg-(--color-accent)"
                                        )}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium text-(--color-fg-subtle) w-8 text-right">
                                      {pct}%
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-(--color-fg-muted)">
                                  {relativeTime(batch.created_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
