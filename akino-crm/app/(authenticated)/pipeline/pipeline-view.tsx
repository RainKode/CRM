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
  Phone,
  Mail,
  StickyNote,
  CalendarClock,
  ChevronRight,
  Filter,
  ChevronDown,
  MoreHorizontal,
  Calendar,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, relativeTime } from "@/lib/utils";
import type { Deal, PipelineStage, LossReason } from "@/lib/types";
import { createDeal, moveDeal, logActivity, setFollowUp } from "./actions";

// ─────────────────────────────────────────────
// Generic dropdown hook (click-outside to close)
// ─────────────────────────────────────────────
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return { open, setOpen, ref };
}

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

// ─────────────────────────────────────────────
// Deal card for kanban
// ─────────────────────────────────────────────
function DealCard({
  deal,
  onClick,
}: {
  deal: Deal;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

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
            {new Date(deal.follow_up_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Kanban column
// ─────────────────────────────────────────────
function KanbanColumn({
  stage,
  deals,
  onCardClick,
  onCreateInStage,
}: {
  stage: PipelineStage;
  deals: Deal[];
  onCardClick: (deal: Deal) => void;
  onCreateInStage: (stageId: string) => void;
}) {
  const isWon = stage.is_won;
  const menu = useDropdown();

  return (
    <div
      className={cn(
        "w-[320px] flex flex-col h-full rounded-2xl p-4 border",
        isWon
          ? "bg-(--color-success)/10 border-(--color-success)/10"
          : "bg-(--color-surface-2)/30 border-(--color-border)/15"
      )}
    >
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              "font-semibold tracking-wide",
              isWon ? "text-(--color-success)" : "text-(--color-fg)"
            )}
          >
            {stage.name}
          </h3>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              isWon
                ? "bg-(--color-success)/20 text-(--color-success) border border-(--color-success)/30"
                : "bg-(--color-surface-3) text-(--color-fg-muted)"
            )}
          >
            {deals.length}
          </span>
        </div>
        <div className="relative" ref={menu.ref}>
          <button
            type="button"
            onClick={() => menu.setOpen(!menu.open)}
            className={cn(
              "cursor-pointer hover:text-(--color-fg) p-1 rounded-md hover:bg-(--color-surface-3) transition-colors",
              isWon ? "text-(--color-success)/50 hover:text-(--color-success)" : "text-(--color-fg-muted)"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu.open && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-1 z-50">
              <button
                type="button"
                onClick={() => { onCreateInStage(stage.id); menu.setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-(--color-fg) hover:bg-(--color-surface-3) transition-colors flex items-center gap-2"
              >
                <Plus className="h-3.5 w-3.5" /> Add deal here
              </button>
            </div>
          )}
        </div>
      </div>
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pb-4 min-h-[60px]" style={{ scrollbarWidth: "none" }}>
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onCardClick(deal)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ─────────────────────────────────────────────
// Create deal dialog
// ─────────────────────────────────────────────
function CreateDealDialog({
  open,
  onOpenChange,
  stages,
  defaultStageId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: PipelineStage[];
  defaultStageId?: string | null;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const resolvedDefault = defaultStageId ?? stages[0]?.id ?? "";
  const [stageId, setStageId] = useState(resolvedDefault);

  // Sync when defaultStageId changes (e.g. opening from a column menu)
  useEffect(() => {
    if (open && defaultStageId) setStageId(defaultStageId);
  }, [open, defaultStageId]);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createDeal({
        contact_name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        stage_id: stageId,
      });
      setName("");
      setCompany("");
      setEmail("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Deal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <Input
              placeholder="Contact name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Input
              placeholder="Company (optional)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <Input
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="h-9 w-full rounded-md border border-(--color-border) bg-(--color-surface-1) px-3 text-sm text-(--color-fg)"
            >
              {stages
                .filter((s) => !s.is_won && !s.is_lost)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || isPending}
            >
              {isPending ? "Adding…" : "Add Deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Deal detail panel
// ─────────────────────────────────────────────
function DealDetail({
  deal,
  stages,
  onClose,
}: {
  deal: Deal;
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "activity">(
    "details"
  );
  const [, startTransition] = useTransition();
  const [summary, setSummary] = useState("");
  const [actType, setActType] = useState<"call" | "email" | "note">("call");

  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    startTransition(async () => {
      await logActivity({
        deal_id: deal.id,
        type: actType,
        summary: summary.trim(),
      });
      setSummary("");
    });
  }

  const currentStage = stages.find((s) => s.id === deal.stage_id);

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-(--color-bg) shadow-(--shadow-popover)">
      <div className="flex items-center justify-between px-6 py-5">
        <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">{deal.contact_name}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full h-8 w-8 flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-6 pb-4">
        {(["details", "activity"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium capitalize transition-colors",
              activeTab === t
                ? "bg-(--color-accent) text-(--color-accent-fg)"
                : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "details" && (
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-(--color-fg-subtle)">Company</span>
              <p>{deal.company || "—"}</p>
            </div>
            <div>
              <span className="text-(--color-fg-subtle)">Email</span>
              <p>{deal.email || "—"}</p>
            </div>
            <div>
              <span className="text-(--color-fg-subtle)">Phone</span>
              <p>{deal.phone || "—"}</p>
            </div>
            <div>
              <span className="text-(--color-fg-subtle)">Stage</span>
              <p>
                <Badge tone="accent">{currentStage?.name ?? "—"}</Badge>
              </p>
            </div>
            {deal.follow_up_at && (
              <div>
                <span className="text-(--color-fg-subtle)">
                  Follow-up
                </span>
                <p>
                  {new Date(deal.follow_up_at).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            )}
            {deal.notes && (
              <div>
                <span className="text-(--color-fg-subtle)">Notes</span>
                <p className="whitespace-pre-wrap text-(--color-fg-muted)">
                  {deal.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-4">
            {/* Log form */}
            <form onSubmit={handleLogActivity} className="space-y-2">
              <div className="flex gap-2">
                {(
                  [
                    { val: "call", Icon: Phone },
                    { val: "email", Icon: Mail },
                    { val: "note", Icon: StickyNote },
                  ] as const
                ).map(({ val, Icon }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setActType(val)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                      actType === val
                        ? "bg-(--color-accent-muted) text-(--color-accent)"
                        : "text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                    )}
                  >
                    <Icon className="h-3 w-3" /> {val}
                  </button>
                ))}
              </div>
              <Input
                placeholder={`Log a ${actType}…`}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={!summary.trim()}>
                Log
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main pipeline view
// ─────────────────────────────────────────────
export function PipelineView({
  stages,
  initialDeals,
  lossReasons,
}: {
  stages: PipelineStage[];
  initialDeals: Deal[];
  lossReasons: LossReason[];
}) {
  const [view, setView] = useState<ViewMode>("kanban");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [filterStageId, setFilterStageId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const filterMenu = useDropdown();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const deals = useMemo(() => {
    let result = initialDeals;
    if (!showClosed) result = result.filter((d) => !d.won_at && !d.lost_at);
    if (filterStageId) result = result.filter((d) => d.stage_id === filterStageId);
    return result;
  }, [initialDeals, showClosed, filterStageId]);

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

    // Find the target stage: over.id could be a deal id or stage column
    const dealId = active.id as string;
    let targetStageId: string | null = null;

    // Check if dropped on a stage directly
    const isStage = stages.some((s) => s.id === over.id);
    if (isStage) {
      targetStageId = over.id as string;
    } else {
      // Dropped on another deal — find which stage that deal is in
      const targetDeal = deals.find((d) => d.id === over.id);
      if (targetDeal) targetStageId = targetDeal.stage_id;
    }

    if (targetStageId) {
      startTransition(() => moveDeal(dealId, targetStageId));
    }
  }

  const draggedDeal = activeDragId
    ? deals.find((d) => d.id === activeDragId)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-8 md:px-12 h-24 shrink-0">
        <h1 className="font-semibold text-3xl tracking-tight text-(--color-fg)">
          Pipeline
        </h1>
        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex items-center bg-(--color-surface-1) p-1 rounded-full border-2 border-(--color-card-border)">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                view === "list"
                  ? "bg-(--color-surface-4) text-(--color-fg) shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                  : "text-(--color-fg-muted) hover:text-(--color-fg)"
              )}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                view === "kanban"
                  ? "bg-(--color-surface-4) text-(--color-fg) shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                  : "text-(--color-fg-muted) hover:text-(--color-fg)"
              )}
            >
              Board View
            </button>
          </div>

          {/* Filter */}
          <div className="relative" ref={filterMenu.ref}>
            <button
              type="button"
              onClick={() => filterMenu.setOpen(!filterMenu.open)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full border bg-(--color-surface-1) hover:bg-(--color-surface-2) transition-colors text-sm font-medium text-(--color-fg)",
                (showClosed || filterStageId)
                  ? "border-(--color-accent)/50"
                  : "border-(--color-card-border)"
              )}
            >
              <Filter className="h-4 w-4" />
              Filter
              {(showClosed || filterStageId) && (
                <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent)" />
              )}
              <ChevronDown className="h-4 w-4 text-(--color-fg-muted)" />
            </button>
            {filterMenu.open && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-2 z-50">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle)">Filters</span>
                  {(showClosed || filterStageId) && (
                    <button
                      type="button"
                      onClick={() => { setShowClosed(false); setFilterStageId(null); }}
                      className="text-xs text-(--color-accent) hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="border-t border-(--color-border)/15 my-1" />
                <label className="flex items-center gap-2 px-4 py-2 text-sm text-(--color-fg) hover:bg-(--color-surface-3) cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                    className="accent-(--color-accent) rounded"
                  />
                  Show closed deals
                </label>
                <div className="border-t border-(--color-border)/15 my-1" />
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-fg-subtle)">By stage</p>
                <button
                  type="button"
                  onClick={() => setFilterStageId(null)}
                  className={cn(
                    "w-full text-left px-4 py-1.5 text-sm transition-colors",
                    !filterStageId ? "text-(--color-accent) bg-(--color-accent-muted)" : "text-(--color-fg) hover:bg-(--color-surface-3)"
                  )}
                >
                  All stages
                </button>
                {stages.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFilterStageId(s.id)}
                    className={cn(
                      "w-full text-left px-4 py-1.5 text-sm transition-colors",
                      filterStageId === s.id ? "text-(--color-accent) bg-(--color-accent-muted)" : "text-(--color-fg) hover:bg-(--color-surface-3)"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Deal */}
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="hidden md:flex"
          >
            <Plus className="h-4 w-4" /> Add Deal
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "kanban" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-6 px-8 md:px-12 pb-8 h-full min-w-max">
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={dealsByStage[stage.id] ?? []}
                  onCardClick={setSelectedDeal}
                  onCreateInStage={(stageId) => {
                    setCreateStageId(stageId);
                    setCreateOpen(true);
                  }}
                />
              ))}
            </div>
            <DragOverlay>
              {draggedDeal && (
                <div className="bg-(--color-surface-1) rounded-xl p-5 w-[320px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-(--color-accent)/50">
                  <div className="absolute inset-0 rounded-xl shadow-[0_0_20px_rgba(0,113,227,0.15)] pointer-events-none" />
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-(--color-fg) text-[15px] leading-tight mb-1">
                        {draggedDeal.company || draggedDeal.contact_name}
                      </h4>
                      <p className="text-xs text-(--color-fg-muted)">{draggedDeal.contact_name}</p>
                    </div>
                  </div>
                  {draggedDeal.deal_value != null && (
                    <div className="text-lg font-semibold text-(--color-fg)">
                      {formatDealValue(draggedDeal.deal_value, draggedDeal.currency)}
                    </div>
                  )}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          // List view
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-(--color-grid-header)">
              <tr>
                {["Name", "Company", "Stage", "Follow-up", "Last Activity"].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-b border-(--color-grid-line) px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-(--color-fg-subtle)"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => {
                const stage = stages.find((s) => s.id === deal.stage_id);
                return (
                  <tr
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal)}
                    className="cursor-pointer border-b border-(--color-grid-line) transition-colors hover:bg-(--color-grid-row-hover)"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {deal.contact_name}
                    </td>
                    <td className="px-4 py-2.5 text-(--color-fg-muted)">
                      {deal.company ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone="accent">{stage?.name ?? "—"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {deal.follow_up_at
                        ? new Date(deal.follow_up_at).toLocaleDateString(
                            "en-GB",
                            { day: "numeric", month: "short" }
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-(--color-fg-subtle)">
                      {deal.last_activity_at
                        ? relativeTime(deal.last_activity_at)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create deal dialog */}
      <CreateDealDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setCreateStageId(null);
        }}
        stages={stages}
        defaultStageId={createStageId}
      />

      {/* Deal detail panel */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-(--color-accent) rounded-full flex items-center justify-center text-white shadow-[0_8px_30px_rgba(0,113,227,0.4)] z-50"
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  );
}
