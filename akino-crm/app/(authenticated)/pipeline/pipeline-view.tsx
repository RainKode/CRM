"use client";

import { useState, useTransition, useMemo } from "react";
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

type ViewMode = "kanban" | "list";

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
      className="bg-(--color-surface-1) rounded-2xl cursor-pointer p-4 space-y-2 hover:-translate-y-0.5 transition-all duration-200 border border-(--color-card-border) hover:border-(--color-border) shadow-(--shadow-card-3d) hover:shadow-(--shadow-card-3d-hover)"
    >
      <p className="text-sm font-medium">{deal.contact_name}</p>
      {deal.company && (
        <p className="text-xs text-(--color-fg-muted)">{deal.company}</p>
      )}
      <div className="flex items-center gap-2">
        {deal.follow_up_at && (
          <Badge
            tone={
              new Date(deal.follow_up_at) < new Date() ? "danger" : "warn"
            }
          >
            <CalendarClock className="h-3 w-3" />
            {new Date(deal.follow_up_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </Badge>
        )}
        {deal.last_activity_at && (
          <span className="text-[10px] text-(--color-fg-subtle)">
            {relativeTime(deal.last_activity_at)}
          </span>
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
}: {
  stage: PipelineStage;
  deals: Deal[];
  onCardClick: (deal: Deal) => void;
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col rounded-2xl bg-(--color-surface-2)/50 border border-(--color-card-border)">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-(--color-fg)">{stage.name}</span>
          <span className="text-xs text-(--color-fg-subtle) bg-(--color-surface-4) rounded-full px-2 py-0.5">
            {deals.length}
          </span>
        </div>
      </div>
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3 overflow-y-auto p-3 min-h-25">
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: PipelineStage[];
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
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
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [, startTransition] = useTransition();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const deals = useMemo(() => {
    if (showClosed) return initialDeals;
    return initialDeals.filter((d) => !d.won_at && !d.lost_at);
  }, [initialDeals, showClosed]);

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-16 py-6">
        <h1 className="text-3xl md:text-[40px] font-bold tracking-tight text-(--color-fg)">
          Sales Pipeline
        </h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="accent-(--color-accent)"
            />
            Show closed
          </label>
          <div className="flex rounded-full bg-(--color-surface-2) p-1">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                view === "kanban"
                  ? "bg-(--color-accent) text-(--color-accent-fg)"
                  : "text-(--color-fg-subtle) hover:text-(--color-fg)"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                view === "list"
                  ? "bg-(--color-accent) text-(--color-accent-fg)"
                  : "text-(--color-fg-subtle) hover:text-(--color-fg)"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add Deal
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "kanban" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-6 min-h-full">
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={dealsByStage[stage.id] ?? []}
                  onCardClick={setSelectedDeal}
                />
              ))}
            </div>
            <DragOverlay>
              {draggedDeal && (
                <div className="bg-(--color-surface-1) rounded-2xl p-4 w-80 opacity-90 shadow-(--shadow-card-3d-hover) border border-(--color-card-border)">
                  <p className="text-sm font-medium">
                    {draggedDeal.contact_name}
                  </p>
                  {draggedDeal.company && (
                    <p className="text-xs text-(--color-fg-muted)">
                      {draggedDeal.company}
                    </p>
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
        onOpenChange={setCreateOpen}
        stages={stages}
      />

      {/* Deal detail panel */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </div>
  );
}
