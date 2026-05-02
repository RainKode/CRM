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
  Rows,
  ChevronDown,
  Calendar,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { Deal, PipelineStage, LossReason, Pipeline } from "@/lib/types";
import { moveDeal, createDeal, searchLeads, type LeadSearchResult } from "../../actions";

type ViewMode = "kanban" | "list" | "compact";

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
  if (!lastActivity) return "bg-(--color-danger) ";
  const diff = Date.now() - new Date(lastActivity).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) return "bg-(--color-success) ";
  if (hours < 72) return "bg-(--color-warn)";
  return "bg-(--color-danger) ";
}

// ─── Sortable Deal Card ────────────────────────────────────────────
function DealCard({ deal, batchName, onClick }: { deal: Deal; batchName?: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isPriority = Boolean(
    deal.follow_up_at && new Date(deal.follow_up_at).getTime() <= Date.now()
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "rounded-2xl p-4 cursor-grab transition-colors border border-transparent",
        isPriority ? "bg-(--color-fg) text-white" : "bg-(--color-surface-2) text-(--color-fg) hover:bg-(--color-surface-3)"
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className={cn("font-display text-xl font-semibold leading-tight mb-1", isPriority ? "text-white" : "text-(--color-fg)")}>
            {deal.company || deal.contact_name}
          </h4>
          <p className={cn("text-sm", isPriority ? "text-white/60" : "text-(--color-fg-muted)")}>{deal.contact_name}</p>
        </div>
      </div>
      {batchName && (
        <span className={cn("inline-block text-[10px] font-medium rounded-full px-2 py-0.5 mb-3", isPriority ? "bg-white/10 text-white/70" : "bg-(--color-blue)/12 text-(--color-blue)")}>
          {batchName}
        </span>
      )}
      {deal.deal_value != null && (
        <div className={cn("text-lg font-semibold mb-4", isPriority ? "text-white" : "text-(--color-fg)")}>
          {formatDealValue(deal.deal_value, deal.currency)}
        </div>
      )}
      <div className={cn("flex items-center justify-between pt-3 border-t", isPriority ? "border-white/14" : "border-(--color-border)")}>
        <div className={cn("flex items-center gap-1.5 text-xs", isPriority ? "text-white/58" : "text-(--color-fg-muted)")}>
          <div className={cn("w-1.5 h-1.5 rounded-full", activityDotColor(deal.last_activity_at))} />
          <span>{deal.last_activity_at ? relativeTime(deal.last_activity_at) : "No activity"}</span>
        </div>
        {deal.follow_up_at && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", isPriority ? "text-white" : "text-(--color-blue)")}>
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
        <div className="flex-1 space-y-3 min-h-25 rounded-2xl bg-white border border-(--color-border) p-3">
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
  const HIDE_EMPTY_KEY = `akino:pipeline:hide-empty:${folderId}`;
  const [view, setView] = useState<ViewMode>("compact");
  const [, startTransition] = useTransition();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [filterBatchId, setFilterBatchId] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [compactExpandedBatch, setCompactExpandedBatch] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const kanbanRef = useRef<HTMLDivElement>(null);
  const [kanbanScrolled, setKanbanScrolled] = useState(false);

  // Load hideEmpty preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HIDE_EMPTY_KEY);
      if (stored !== null) setHideEmpty(stored === "true");
    } catch { /* ignore */ }
  }, [HIDE_EMPTY_KEY]);

  function toggleHideEmpty() {
    setHideEmpty((v) => {
      const next = !v;
      try { localStorage.setItem(HIDE_EMPTY_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Close overflow menu on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  // Track kanban horizontal scroll for sticky shadow
  useEffect(() => {
    const el = kanbanRef.current;
    if (!el) return;
    function handleScroll() { setKanbanScrolled(el!.scrollLeft > 0); }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build a set of batch IDs from pipelines for filtering
  const batchPipelines = pipelines.filter((p) => p.batch_id);

  // Short label derivation for batch chips
  function batchShortLabel(p: Pipeline, i: number): string {
    const match = p.name.match(/batch\s*#?\s*(\d+)/i);
    if (match) return `Batch #${match[1]}`;
    if (p.name.length <= 12) return p.name;
    return `Batch #${i + 1}`;
  }

  const deals = useMemo(() => {
    let result = initialDeals;
    if (!showClosed) result = result.filter((d) => !d.won_at && !d.lost_at);
    if (filterBatchId) {
      void filterBatchId; // filter not yet supported without per-deal pipeline_id
    }
    return result;
  }, [initialDeals, showClosed, filterBatchId]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    return map;
  }, [stages, deals]);

  // Visible stages (excluding closed unless toggled, excluding empty unless toggled off)
  const visibleStages = useMemo(() => {
    let result = showClosed ? stages : stages.filter((s) => !s.is_won && !s.is_lost);
    if (hideEmpty) result = result.filter((s) => (dealsByStage[s.id]?.length ?? 0) > 0);
    return result;
  }, [stages, showClosed, hideEmpty, dealsByStage]);

  const hiddenEmptyCount = useMemo(() => {
    const base = showClosed ? stages : stages.filter((s) => !s.is_won && !s.is_lost);
    return base.filter((s) => (dealsByStage[s.id]?.length ?? 0) === 0).length;
  }, [stages, showClosed, dealsByStage]);

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

  // Chip overflow: first 5 inline, rest in dropdown
  const CHIP_LIMIT = 5;
  const visibleChips = batchPipelines.slice(0, CHIP_LIMIT);
  const overflowChips = batchPipelines.slice(CHIP_LIMIT);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="px-8 md:px-12 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: back + title */}
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/pipeline"
              className="flex items-center gap-1 text-sm text-(--color-fg-muted) hover:text-(--color-fg) transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="font-semibold text-2xl tracking-tight text-(--color-fg) truncate">
              {folderName}
            </h1>
            <span className="text-sm text-(--color-fg-muted) shrink-0">
              {deals.length} deals &middot; {formatDealValue(totalValue, "GBP")}
            </span>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Batch filter chips */}
            {batchPipelines.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap max-h-9 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFilterBatchId(null)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full font-medium transition-colors shrink-0",
                    filterBatchId === null
                      ? "bg-(--color-accent) text-(--color-accent-fg)"
                      : "bg-(--color-surface-1) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                  )}
                >
                  All
                </button>
                {visibleChips.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    onClick={() => setFilterBatchId(filterBatchId === p.batch_id ? null : p.batch_id!)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full font-medium transition-colors shrink-0",
                      filterBatchId === p.batch_id
                        ? "bg-(--color-accent) text-(--color-accent-fg)"
                        : "bg-(--color-surface-1) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                    )}
                  >
                    {batchShortLabel(p, i)}
                  </button>
                ))}
                {overflowChips.length > 0 && (
                  <div className="relative shrink-0" ref={overflowRef}>
                    <button
                      type="button"
                      onClick={() => setOverflowOpen((v) => !v)}
                      className="text-xs px-3 py-1.5 rounded-full font-medium bg-(--color-surface-1) text-(--color-fg-muted) hover:bg-(--color-surface-2) flex items-center gap-1"
                    >
                      +{overflowChips.length} more
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {overflowOpen && (
                      <div className="absolute right-0 top-9 z-50 w-48 rounded-2xl bg-(--color-surface-1) border border-(--color-border) py-1">
                        {overflowChips.map((p, i) => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.name}
                            onClick={() => {
                              setFilterBatchId(filterBatchId === p.batch_id ? null : p.batch_id!);
                              setOverflowOpen(false);
                            }}
                            className={cn(
                              "w-full text-left text-sm px-3 py-2 hover:bg-(--color-surface-2) transition-colors",
                              filterBatchId === p.batch_id ? "text-(--color-blue)" : "text-(--color-fg)"
                            )}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* View toggle */}
            <div className="flex items-center bg-(--color-surface-1) p-1 rounded-full border border-(--color-border)">
              <button
                type="button"
                title="Compact summary"
                onClick={() => setView("compact")}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  view === "compact" ? "bg-(--color-accent) text-(--color-accent-fg)" : "text-(--color-fg-muted)"
                )}
              >
                <Rows className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Kanban"
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
                title="List"
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
                  ? "border-(--color-blue) text-(--color-blue) bg-(--color-blue)/12"
                  : "border-(--color-border) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              )}
            >
              {showClosed ? "Hide Closed" : "Show Closed"}
            </button>

            {/* Hide empty toggle */}
            <button
              type="button"
              onClick={toggleHideEmpty}
              className={cn(
                "text-xs px-4 py-2 rounded-full font-medium border transition-colors",
                hideEmpty
                  ? "border-(--color-blue) text-(--color-blue) bg-(--color-blue)/12"
                  : "border-(--color-border) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
              )}
            >
              {hideEmpty ? "Show Empty" : "Hide Empty"}
            </button>
          </div>
        </div>
      </header>

      {/* Empty stage state */}
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

      {/* Compact view */}
      {stages.length > 0 && view === "compact" && (
        <div className="flex-1 overflow-y-auto px-8 md:px-12 pb-8">
          <CompactView
            stages={stages}
            pipelines={batchPipelines}
            dealsByStage={dealsByStage}
            expandedBatch={compactExpandedBatch}
            onExpandBatch={setCompactExpandedBatch}
            onSwitchToKanban={() => setView("kanban")}
          />
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
          <div
            ref={kanbanRef}
            className="flex-1 overflow-x-auto scroll-smooth px-8 md:px-12 pb-8"
          >
            <div className="flex gap-6 h-full">
              {visibleStages.map((stage, idx) => {
                const stageDeals = dealsByStage[stage.id] ?? [];
                const stageTotal = stageDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
                const isFirst = idx === 0;
                return (
                  <div
                    key={stage.id}
                    className={cn(
                      isFirst && "sticky left-0 z-10 bg-(--color-bg)",
                      isFirst && kanbanScrolled && "[box-shadow:8px_0_12px_-8px_rgba(0,0,0,0.2)]"
                    )}
                  >
                    <KanbanColumn
                      stage={stage}
                      deals={stageDeals}
                      total={stageTotal}
                      pipelines={pipelines}
                      onCardClick={setSelectedDeal}
                    />
                  </div>
                );
              })}
              {hideEmpty && hiddenEmptyCount > 0 && (
                <div className="flex items-start pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={toggleHideEmpty}
                    className="text-xs px-3 py-1.5 rounded-full font-medium bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
                  >
                    +{hiddenEmptyCount} empty stage{hiddenEmptyCount !== 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </div>
          </div>
          <DragOverlay>
            {draggedDeal && (
              <div className="bg-(--color-surface-1) rounded-xl p-5  border-2 border-(--color-blue) w-80 opacity-90">
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
          <div className="bg-(--color-surface-1) rounded-2xl border border-(--color-border) overflow-hidden">
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
                        <span className="text-[10px] font-medium bg-(--color-blue)/12 text-(--color-blue) rounded-full px-2 py-0.5">
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

// ────────────────────────────────────────────────────────────────────────────
// CompactView: matrix of batches × stages showing deal counts + values
// ────────────────────────────────────────────────────────────────────────────
function CompactView({
  stages,
  pipelines,
  dealsByStage,
  expandedBatch,
  onExpandBatch,
  onSwitchToKanban,
}: {
  stages: PipelineStage[];
  pipelines: Pipeline[];
  dealsByStage: Record<string, Deal[]>;
  expandedBatch: string | null;
  onExpandBatch: (id: string | null) => void;
  onSwitchToKanban: () => void;
}) {
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const allDeals = Object.values(dealsByStage).flat();

  if (pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-(--color-fg-muted)">
        No batch pipelines in this folder yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Column headers */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-(--color-fg-muted)">
              <th className="text-left font-medium pb-2 pr-4 whitespace-nowrap w-40">Batch</th>
              {openStages.map((s) => (
                <th key={s.id} className="text-center font-medium pb-2 px-2 whitespace-nowrap min-w-[80px]" title={s.name}>
                  {s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name}
                </th>
              ))}
              <th className="text-right font-medium pb-2 pl-4 whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p, i) => {
              const batchDeals = allDeals; // TODO: filter by pipeline when source_pipeline_id lands
              const batchLabel = (() => {
                const m = p.name.match(/batch\s*#?\s*(\d+)/i);
                if (m) return `Batch #${m[1]}`;
                if (p.name.length <= 14) return p.name;
                return `Batch #${i + 1}`;
              })();
              const batchTotal = batchDeals.reduce((s, d) => s + (d.deal_value ?? 0), 0);
              return (
                <tr
                  key={p.id}
                  className="border-t border-(--color-border)/40 hover:bg-(--color-surface-1) transition-colors"
                >
                  <td className="py-3 pr-4 font-medium text-(--color-fg) whitespace-nowrap">
                    <button
                      type="button"
                      title={p.name}
                      onClick={() => onExpandBatch(expandedBatch === p.id ? null : p.id)}
                      className="flex items-center gap-1.5 text-left hover:text-(--color-blue) transition-colors"
                    >
                      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expandedBatch === p.id && "rotate-90")} />
                      {batchLabel}
                    </button>
                  </td>
                  {openStages.map((s) => {
                    const count = (dealsByStage[s.id] ?? []).length;
                    return (
                      <td key={s.id} className="py-3 px-2 text-center">
                        {count > 0 ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-(--color-blue)/12 text-(--color-blue) text-xs font-semibold">
                            {count}
                          </span>
                        ) : (
                          <span className="text-(--color-fg-subtle) text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 pl-4 text-right font-semibold text-(--color-fg) whitespace-nowrap">
                    {batchTotal > 0 ? formatDealValue(batchTotal, "GBP") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CTA to switch to full kanban */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSwitchToKanban}
          className="text-xs text-(--color-fg-muted) hover:text-(--color-fg) transition-colors flex items-center gap-1"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Switch to full kanban view
        </button>
      </div>
    </div>
  );
}
