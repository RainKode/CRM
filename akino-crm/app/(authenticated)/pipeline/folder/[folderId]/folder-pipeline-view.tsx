"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LayoutGrid,
  List,
  Plus,
  ChevronRight,
  Filter,
  ChevronDown,
  Calendar,
  X,
  Search,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { Deal, PipelineStage, LossReason, Pipeline } from "@/lib/types";
import { moveDeal, createDeal, searchLeads, type LeadSearchResult } from "../../actions";

type ViewMode = "kanban" | "list";

function formatDealValue(value: number | null, currency: string): string {
  if (value == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "GBP" ? "GBP" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function activityDotColor(lastActivity: string | null): string {
  if (!lastActivity) return "bg-(--color-danger) shadow-[0_0_8px_rgba(220,38,38,0.6)]";
  const diff = Date.now() - new Date(lastActivity).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) return "bg-(--color-success) shadow-[0_0_8px_rgba(22,163,74,0.6)]";
  if (hours < 72) return "bg-(--color-warn)";
  return "bg-(--color-danger) shadow-[0_0_8px_rgba(220,38,38,0.6)]";
}

// ─── Sortable Deal Card ────────────────────────────────────────────
function DealCard({ deal, batchName, onClick }: { deal: Deal; batchName?: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-(--color-surface-1) rounded-xl p-5 cursor-grab hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all border-2 border-(--color-card-border)"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-semibold text-(--color-fg) text-[15px] leading-tight mb-1">
            {deal.company || deal.contact_name}
          </h4>
          <p className="text-xs text-(--color-fg-muted)">{deal.contact_name}</p>
        </div>
      </div>
      {batchName && (
        <span className="inline-block text-[10px] font-medium bg-(--color-accent)/15 text-(--color-accent) rounded-full px-2 py-0.5 mb-3">
          {batchName}
        </span>
      )}
      {deal.deal_value != null && (
        <div className="text-lg font-semibold text-(--color-fg) mb-4">
          {formatDealValue(deal.deal_value, deal.currency)}
        </div>
      )}
      <div className="flex items-center justify-between pt-3 border-t border-(--color-surface-4)">
        <div className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
          <div className={cn("w-1.5 h-1.5 rounded-full", activityDotColor(deal.last_activity_at))} />
          <span>{deal.last_activity_at ? relativeTime(deal.last_activity_at) : "No activity"}</span>
        </div>
        {deal.follow_up_at && (
          <div className="flex items-center gap-1 text-xs text-(--color-accent) font-medium">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(deal.follow_up_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ──────────────────────────────────────────────
function KanbanColumn({
  stage,
  deals,
  total,
  pipelines,
  onCardClick,
}: {
  stage: PipelineStage;
  deals: Deal[];
  total: number;
  pipelines: Pipeline[];
  onCardClick: (deal: Deal) => void;
}) {
  const { setNodeRef } = useSortable({ id: stage.id, data: { type: "column" } });
  const pipelineMap = new Map(pipelines.map((p) => [p.id, p.name]));

  // Find batch name for a deal by matching its stage's pipeline
  function getBatchName(deal: Deal): string | undefined {
    // We need to match deal to a pipeline through the stage
    // For aggregated view we just show source_folder_id based info
    // The pipeline name is the batch name
    for (const p of pipelines) {
      if (p.batch_id && deal.source_folder_id === p.folder_id) {
        return p.name;
      }
    }
    return undefined;
  }

  return (
    <div ref={setNodeRef} className="flex flex-col w-80 shrink-0">
      <div className="flex items-center justify-between px-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm text-(--color-fg)">{stage.name}</h3>
          <span className="text-xs bg-(--color-surface-2) text-(--color-fg-muted) rounded-full px-2 py-0.5 font-medium">
            {deals.length}
          </span>
        </div>
        {total > 0 && (
          <span className="text-xs text-(--color-fg-subtle) font-medium">
            {formatDealValue(total, "GBP")}
          </span>
        )}
      </div>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-3 min-h-25 rounded-xl p-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              batchName={getBatchName(deal)}
              onClick={() => onCardClick(deal)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export function FolderPipelineView({
  folderId,
  folderName,
  pipelines,
  stages,
  initialDeals,
  lossReasons,
}: {
  folderId: string;
  folderName: string;
  pipelines: Pipeline[];
  stages: PipelineStage[];
  initialDeals: Deal[];
  lossReasons: LossReason[];
}) {
  const [view, setView] = useState<ViewMode>("kanban");
  const [, startTransition] = useTransition();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [filterBatchId, setFilterBatchId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build a set of batch IDs from pipelines for filtering
  const batchPipelines = pipelines.filter((p) => p.batch_id);

  const deals = useMemo(() => {
    let result = initialDeals;
    if (!showClosed) result = result.filter((d) => !d.won_at && !d.lost_at);
    if (filterBatchId) {
      // Find the pipeline for this batch, then filter by its stages
      const batchPipeline = pipelines.find((p) => p.batch_id === filterBatchId);
      if (batchPipeline) {
        // We need stage IDs for this pipeline, but we only have shared stages
        // In the aggregated model, deals from different batch pipelines share the same stage names
        // For now, filter by source_folder_id match is not enough — we use pipeline-based filtering
        // Actually, since stages are shared (copied from template), each batch pipeline has its own stages
        // But in the aggregated view, we only load one set of stages (from the first pipeline)
        // So filtering by batch pipeline stages isn't possible in the aggregated view
        // Instead, we'll need a different approach — checking which pipeline a deal's stage belongs to
        result = result; // TODO: needs per-deal pipeline association
      }
    }
    return result;
  }, [initialDeals, showClosed, filterBatchId, pipelines]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    return map;
  }, [stages, deals]);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const dealId = active.id as string;
    let targetStageId: string | null = null;

    const isStage = stages.some((s) => s.id === over.id);
    if (isStage) {
      targetStageId = over.id as string;
    } else {
      const targetDeal = deals.find((d) => d.id === over.id);
      if (targetDeal) targetStageId = targetDeal.stage_id;
    }

    if (targetStageId) {
      startTransition(() => moveDeal(dealId, targetStageId));
    }
  }

  const draggedDeal = activeDragId ? deals.find((d) => d.id === activeDragId) : null;

  const totalValue = deals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-8 md:px-12 h-24 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/pipeline"
            className="flex items-center gap-1 text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="font-semibold text-3xl tracking-tight text-(--color-fg)">
            {folderName}
          </h1>
          <span className="text-sm text-(--color-fg-muted)">
            {deals.length} deals &middot; {formatDealValue(totalValue, "GBP")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Batch filter badges */}
          {batchPipelines.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterBatchId(null)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full font-medium transition-colors",
                  filterBatchId === null
                    ? "bg-(--color-accent) text-(--color-accent-fg)"
                    : "bg-(--color-surface-1) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                )}
              >
                All
              </button>
              {batchPipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilterBatchId(filterBatchId === p.batch_id ? null : p.batch_id!)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full font-medium transition-colors",
                    filterBatchId === p.batch_id
                      ? "bg-(--color-accent) text-(--color-accent-fg)"
                      : "bg-(--color-surface-1) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center bg-(--color-surface-1) p-1 rounded-full border-2 border-(--color-card-border)">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === "kanban" ? "bg-(--color-accent) text-(--color-accent-fg)" : "text-(--color-fg-muted)"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === "list" ? "bg-(--color-accent) text-(--color-accent-fg)" : "text-(--color-fg-muted)"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Show closed toggle */}
          <button
            type="button"
            onClick={() => setShowClosed(!showClosed)}
            className={cn(
              "text-xs px-4 py-2 rounded-full font-medium border transition-colors",
              showClosed
                ? "border-(--color-accent) text-(--color-accent) bg-(--color-accent)/10"
                : "border-(--color-card-border) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            )}
          >
            {showClosed ? "Hide Closed" : "Show Closed"}
          </button>
        </div>
      </header>

      {/* Empty stage state – shown when no pipeline in this folder has stages yet */}
      {stages.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-3 max-w-xs">
            <div className="w-16 h-16 rounded-2xl bg-(--color-surface-2) flex items-center justify-center mx-auto">
              <LayoutGrid className="h-8 w-8 text-(--color-fg-muted)" />
            </div>
            <div>
              <h3 className="font-semibold text-(--color-fg) mb-1">No stages found</h3>
              <p className="text-sm text-(--color-fg-muted)">
                None of the pipelines in this folder have stages yet. Visit each pipeline to repair them.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Kanban */}
      {stages.length > 0 && view === "kanban" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto px-8 md:px-12 pb-8">
            <div className="flex gap-6 h-full">
              {(showClosed ? stages : openStages).map((stage) => {
                const stageDeals = dealsByStage[stage.id] ?? [];
                const stageTotal = stageDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
                return (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    deals={stageDeals}
                    total={stageTotal}
                    pipelines={pipelines}
                    onCardClick={setSelectedDeal}
                  />
                );
              })}
            </div>
          </div>
          <DragOverlay>
            {draggedDeal && (
              <div className="bg-(--color-surface-1) rounded-xl p-5 shadow-2xl border-2 border-(--color-accent) w-80 opacity-90">
                <h4 className="font-semibold text-(--color-fg) text-[15px]">
                  {draggedDeal.company || draggedDeal.contact_name}
                </h4>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* List view */}
      {stages.length > 0 && view === "list" && (
        <div className="flex-1 overflow-y-auto px-8 md:px-12 pb-8">
          <div className="bg-(--color-surface-1) rounded-2xl border-2 border-(--color-card-border) overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--color-border)">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                    Deal
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                    Value
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                    Batch
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                    Activity
                  </th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const stage = stages.find((s) => s.id === deal.stage_id);
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => setSelectedDeal(deal)}
                      className="border-b border-(--color-border) last:border-0 hover:bg-(--color-surface-2) cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-sm text-(--color-fg)">
                          {deal.company || deal.contact_name}
                        </div>
                        <div className="text-xs text-(--color-fg-muted)">{deal.contact_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium bg-(--color-surface-2) text-(--color-fg-muted) rounded-full px-3 py-1">
                          {stage?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-(--color-fg)">
                        {formatDealValue(deal.deal_value, deal.currency)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-medium bg-(--color-accent)/15 text-(--color-accent) rounded-full px-2 py-0.5">
                          {pipelines.find((p) => p.batch_id)?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
                          <div className={cn("w-1.5 h-1.5 rounded-full", activityDotColor(deal.last_activity_at))} />
                          <span>{deal.last_activity_at ? relativeTime(deal.last_activity_at) : "No activity"}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {deals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-(--color-fg-muted)">
                      No deals in this folder yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
