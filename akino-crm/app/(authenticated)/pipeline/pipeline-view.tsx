"use client";

import { useState, useTransition, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
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
  Trash2,
  Search,
  UserPlus,
  Star,
  CheckCircle2,
  XCircle,
  Globe,
  User,
  CheckSquare,
  Square,
  ArrowRight,
  ChevronsRight,
  Download,
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
import type { Deal, PipelineStage, LossReason, Pipeline, Activity, ActivityType, ActivityStatus } from "@/lib/types";
import { createDeal, moveDeal, logActivity, setFollowUp, deleteDeal, searchLeads, createPipeline, renamePipeline, deletePipeline, getDealActivities, markDealLost, updateDeal, completeScheduledActivity, type LeadSearchResult } from "./actions";
import { LossReasonDialog } from "./loss-reason-dialog";
import { QuickLogPopover } from "./quick-log-popover";
import { SavedViewPicker } from "../saved-views/saved-view-picker";
import { downloadCsv, csvCell, timestampedFilename } from "@/lib/csv-export";

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
  bulkMode,
  isSelected,
  onToggleSelect,
  onQuickLog,
}: {
  deal: Deal;
  onClick: () => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onQuickLog?: (dealId: string, anchor: DOMRect) => void;
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
      onClick={bulkMode ? onToggleSelect : onClick}
      className={cn(
        "bg-(--color-surface-1) rounded-xl p-5 cursor-grab hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all border-2 group/card",
        isSelected
          ? "border-(--color-accent) ring-1 ring-(--color-accent)/30"
          : "border-(--color-card-border)"
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {bulkMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
              className="shrink-0 mt-0.5"
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-(--color-accent)" />
              ) : (
                <Square className="h-4 w-4 text-(--color-fg-muted)" />
              )}
            </button>
          )}
          <div className="min-w-0">
            <h4 className="font-semibold text-(--color-fg) text-[15px] leading-tight mb-1 truncate">
              {deal.company || deal.contact_name}
            </h4>
            <p className="text-xs text-(--color-fg-muted) truncate">{deal.contact_name}</p>
          </div>
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

      {/* Quick-log row — shows on hover; opens popover anchored to the button */}
      {!bulkMode && onQuickLog && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onQuickLog(deal.id, rect);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-(--color-surface-2) hover:bg-(--color-surface-3) py-1.5 text-[11px] font-medium text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
            title="Log or schedule an activity"
          >
            <Phone className="h-3 w-3" />
            <Mail className="h-3 w-3" />
            <StickyNote className="h-3 w-3" />
            <span className="ml-1">Log</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Kanban column
// ─────────────────────────────────────────────
function KanbanColumn({
  stage,
  deals,
  totalCount,
  onCardClick,
  onCreateInStage,
  onExpandColumn,
  isExpanded,
  bulkMode,
  selectedDealIds,
  onToggleSelect,
  onSelectAll,
  onQuickLog,
}: {
  stage: PipelineStage;
  deals: Deal[];
  totalCount: number;
  onCardClick: (deal: Deal) => void;
  onCreateInStage: (stageId: string) => void;
  onExpandColumn?: () => void;
  isExpanded?: boolean;
  bulkMode?: boolean;
  selectedDealIds?: Set<string>;
  onToggleSelect?: (dealId: string) => void;
  onSelectAll?: () => void;
  onQuickLog?: (dealId: string, anchor: DOMRect) => void;
}) {
  const isWon = stage.is_won;
  const menu = useDropdown();
  const queuedCount = totalCount - deals.length;
  const allSelected = deals.length > 0 && deals.every((d) => selectedDealIds?.has(d.id));

  // Make the column itself a droppable zone so empty columns can receive drops
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setDroppableRef}
      className={cn(
        "w-[320px] flex flex-col h-full rounded-2xl p-4 border-2 transition-colors",
        isOver
          ? "border-(--color-accent) bg-(--color-accent)/5"
          : isWon
            ? "bg-(--color-success)/10 border-(--color-success)/40"
            : "bg-(--color-surface-2)/30 border-(--color-card-border)"
      )}
    >
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex items-center gap-2">
          {bulkMode && (
            <button
              type="button"
              onClick={onSelectAll}
              className="shrink-0"
              title={allSelected ? "Deselect all" : "Select all"}
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-(--color-accent)" />
              ) : (
                <Square className="h-4 w-4 text-(--color-fg-muted)" />
              )}
            </button>
          )}
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
            {totalCount}
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
        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pb-4 min-h-15" style={{ scrollbarWidth: "none" }}>
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onCardClick(deal)}
              bulkMode={bulkMode}
              isSelected={selectedDealIds?.has(deal.id)}
              onToggleSelect={() => onToggleSelect?.(deal.id)}
              onQuickLog={onQuickLog}
            />
          ))}
        </div>
      </SortableContext>
      {queuedCount > 0 && (
        <button
          type="button"
          onClick={onExpandColumn}
          className="mt-2 w-full py-2 rounded-xl bg-(--color-surface-3)/50 hover:bg-(--color-surface-3) text-xs font-medium text-(--color-fg-muted) hover:text-(--color-fg) transition-colors flex items-center justify-center gap-1.5"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
          {isExpanded ? "Show less" : `+${queuedCount} more in queue`}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Create deal dialog
// ─────────────────────────────────────────────
type DealMode = "new" | "from_leads";

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
  const [mode, setMode] = useState<DealMode>("new");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const resolvedDefault = defaultStageId ?? stages[0]?.id ?? "";
  const [stageId, setStageId] = useState(resolvedDefault);

  // Lead search state
  const [leadQuery, setLeadQuery] = useState("");
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (open && defaultStageId) setStageId(defaultStageId);
  }, [open, defaultStageId]);

  // Reset when dialog closes or mode changes
  useEffect(() => {
    if (!open) {
      setMode("new");
      setName("");
      setCompany("");
      setEmail("");
      setLeadQuery("");
      setLeadResults([]);
      setSelectedLead(null);
      setEnrichedOnly(false);
    }
  }, [open]);

  const [isPending, startTransition] = useTransition();

  function handleSearch(query: string) {
    setLeadQuery(query);
    setSelectedLead(null);
    if (query.trim().length < 2) {
      setLeadResults([]);
      return;
    }
    setIsSearching(true);
    startTransition(async () => {
      const results = await searchLeads({ query: query.trim(), enrichedOnly });
      setLeadResults(results);
      setIsSearching(false);
    });
  }

  function handleEnrichedToggle(checked: boolean) {
    setEnrichedOnly(checked);
    if (leadQuery.trim().length >= 2) {
      setIsSearching(true);
      startTransition(async () => {
        const results = await searchLeads({ query: leadQuery.trim(), enrichedOnly: checked });
        setLeadResults(results);
        setIsSearching(false);
      });
    }
  }

  function selectLead(lead: LeadSearchResult) {
    setSelectedLead(lead);
    setName(lead.name || "");
    setCompany(lead.company || "");
    setEmail(lead.email || "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createDeal({
        contact_name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        stage_id: stageId,
        lead_id: selectedLead?.id || undefined,
        source_folder_id: selectedLead?.folder_id || undefined,
      });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Deal</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 px-6 pb-2">
          {([
            { val: "new" as DealMode, label: "New Client", Icon: UserPlus },
            { val: "from_leads" as DealMode, label: "From Lead Database", Icon: Search },
          ] as const).map(({ val, label, Icon }) => (
            <button
              key={val}
              type="button"
              onClick={() => { setMode(val); setSelectedLead(null); setName(""); setCompany(""); setEmail(""); }}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                mode === val
                  ? "bg-(--color-accent) text-(--color-accent-fg)"
                  : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            {mode === "from_leads" && (
              <>
                {/* Lead search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-fg-subtle)" />
                  <input
                    type="text"
                    placeholder="Search leads by name, email, or company…"
                    value={leadQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    autoFocus
                    className="w-full h-10 rounded-xl bg-(--color-surface-2) border-none pl-10 pr-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                  />
                </div>

                {/* Enriched filter */}
                <label className="flex items-center gap-2 text-sm text-(--color-fg-muted) cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrichedOnly}
                    onChange={(e) => handleEnrichedToggle(e.target.checked)}
                    className="accent-(--color-accent) rounded"
                  />
                  Show enriched leads only
                </label>

                {/* Search results */}
                {leadQuery.trim().length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-(--color-card-border) bg-(--color-surface-1)">
                    {isSearching ? (
                      <p className="text-sm text-(--color-fg-muted) text-center py-4">Searching…</p>
                    ) : leadResults.length === 0 ? (
                      <p className="text-sm text-(--color-fg-muted) text-center py-4">No leads found</p>
                    ) : (
                      leadResults.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => selectLead(lead)}
                          className={cn(
                            "w-full text-left px-4 py-3 border-b border-(--color-card-border) last:border-b-0 transition-colors flex items-center justify-between gap-3",
                            selectedLead?.id === lead.id
                              ? "bg-(--color-accent)/10"
                              : "hover:bg-(--color-surface-2)"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-(--color-fg) truncate">
                              {lead.name || "No name"}
                            </p>
                            <p className="text-xs text-(--color-fg-muted) truncate">
                              {[lead.company, lead.email].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {lead.status === "enriched" && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-(--color-success) bg-(--color-success)/10 px-2 py-0.5 rounded-full">
                                Enriched
                              </span>
                            )}
                            {lead.quality_rating != null && (
                              <span className="flex items-center gap-0.5 text-xs text-(--color-accent)">
                                <Star className="h-3 w-3" /> {lead.quality_rating}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {selectedLead && (
                  <p className="text-xs text-(--color-fg-muted)">
                    Selected: <span className="font-medium text-(--color-fg)">{selectedLead.name || selectedLead.email}</span>
                  </p>
                )}
              </>
            )}

            {/* Manual fields (always shown so user can edit after selecting a lead) */}
            <Input
              placeholder="Contact name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={mode === "new"}
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
// Timeline helpers
// ─────────────────────────────────────────────
type TimelineEventType = ActivityType | "created";

function getTimelineIcon(type: TimelineEventType) {
  switch (type) {
    case "created": return <Plus className="h-3.5 w-3.5" />;
    case "call": return <Phone className="h-3.5 w-3.5" />;
    case "email": return <Mail className="h-3.5 w-3.5" />;
    case "note": return <StickyNote className="h-3.5 w-3.5" />;
    case "stage_change": return <ChevronRight className="h-3.5 w-3.5" />;
    case "follow_up_set": return <CalendarClock className="h-3.5 w-3.5" />;
    case "won": return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "lost": return <XCircle className="h-3.5 w-3.5" />;
    default: return <StickyNote className="h-3.5 w-3.5" />;
  }
}

function getTimelineTitle(type: TimelineEventType): string {
  switch (type) {
    case "created": return "Deal Created";
    case "call": return "Call Logged";
    case "email": return "Email Logged";
    case "note": return "Note Added";
    case "stage_change": return "Stage Changed";
    case "follow_up_set": return "Follow-up Set";
    case "won": return "Deal Won";
    case "lost": return "Deal Lost";
    default: return "Activity";
  }
}

function getTimelineColor(type: TimelineEventType): string {
  switch (type) {
    case "created": return "bg-(--color-accent)/15 text-(--color-accent)";
    case "won": return "bg-(--color-success)/15 text-(--color-success)";
    case "lost": return "bg-(--color-danger)/15 text-(--color-danger)";
    case "email": return "bg-(--color-info)/15 text-(--color-info)";
    case "call": return "bg-(--color-accent)/15 text-(--color-accent)";
    case "stage_change": return "bg-(--color-warn)/15 text-(--color-warn)";
    case "follow_up_set": return "bg-(--color-accent)/15 text-(--color-accent)";
    case "note": return "bg-(--color-surface-3) text-(--color-fg-muted)";
    default: return "bg-(--color-surface-3) text-(--color-fg-muted)";
  }
}

function getTimelineBadgeColor(type: TimelineEventType): string {
  switch (type) {
    case "created": return "bg-(--color-accent)/15 text-(--color-accent)";
    case "won": return "bg-(--color-success)/15 text-(--color-success)";
    case "lost": return "bg-(--color-danger)/15 text-(--color-danger)";
    case "email": return "bg-(--color-info)/15 text-(--color-info)";
    case "call": return "bg-(--color-accent)/15 text-(--color-accent)";
    case "stage_change": return "bg-(--color-warn)/15 text-(--color-warn)";
    case "follow_up_set": return "bg-(--color-highlight)/15 text-(--color-highlight)";
    case "note": return "bg-(--color-surface-3) text-(--color-fg-muted)";
    default: return "bg-(--color-surface-3) text-(--color-fg-muted)";
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────
// Timeline card (used in alternating layout)
// ─────────────────────────────────────────────
type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  summary: string | null;
  notes: string | null;
  occurred_at: string;
  stage_from: string | null;
  stage_to: string | null;
  email_subject: string | null;
  call_direction: string | null;
  call_duration_seconds: number | null;
  status: ActivityStatus;
  scheduled_at: string | null;
};

function TimelineCard({
  event,
  onMarkDone,
}: {
  event: TimelineEvent;
  onMarkDone?: (id: string) => void;
}) {
  const isScheduled = event.status === "scheduled";
  return (
    <div
      className={cn(
        "bg-(--color-surface-2)/50 border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all",
        isScheduled
          ? "border-(--color-info)/40 hover:border-(--color-info)/60"
          : "border-(--color-border)/15 hover:border-(--color-border)/30"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-medium text-(--color-fg-subtle) leading-tight">
          {formatTimestamp(event.occurred_at)}
        </span>
        <span className={cn(
          "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 leading-tight",
          isScheduled
            ? "bg-(--color-info)/15 text-(--color-info)"
            : getTimelineBadgeColor(event.type)
        )}>
          {isScheduled ? `Scheduled · ${getTimelineTitle(event.type)}` : getTimelineTitle(event.type)}
        </span>
      </div>
      {event.summary && (
        <p className="text-[13px] text-(--color-fg) leading-snug mt-1">{event.summary}</p>
      )}
      {event.email_subject && (
        <p className="text-[11px] text-(--color-fg-subtle) mt-1">Subject: {event.email_subject}</p>
      )}
      {event.call_duration_seconds != null && event.call_duration_seconds > 0 && (
        <p className="text-[11px] text-(--color-fg-subtle) mt-1">
          {Math.floor(event.call_duration_seconds / 60)}m {event.call_duration_seconds % 60}s
          {event.call_direction && ` · ${event.call_direction}`}
        </p>
      )}
      {event.notes && (
        <div className="mt-2 p-2 rounded-lg bg-(--color-surface-3)/30 border border-(--color-border)/10">
          <p className="text-[11px] text-(--color-fg-muted) leading-relaxed">{event.notes}</p>
        </div>
      )}
      {isScheduled && onMarkDone && (
        <button
          type="button"
          onClick={() => onMarkDone(event.id)}
          className="mt-2 text-[11px] font-medium text-(--color-info) hover:underline inline-flex items-center gap-1"
        >
          <CheckCircle2 className="h-3 w-3" /> Mark done
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Deal detail panel (full-width with timeline)
// ─────────────────────────────────────────────
function DealDetail({
  deal,
  stages,
  lossReasons,
  onClose,
}: {
  deal: Deal;
  stages: PipelineStage[];
  lossReasons: LossReason[];
  onClose: () => void;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "activity">("details");
  const [, startTransition] = useTransition();

  // Activity logging
  const [summary, setSummary] = useState("");
  const [actType, setActType] = useState<"call" | "email" | "note">("call");

  // Loss reason menu
  const lossMenu = useDropdown();

  // Follow-up
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const timelineRef = useRef<HTMLDivElement>(null);
  const addActivityBtnRef = useRef<HTMLButtonElement>(null);

  // Quick-log popover anchor (Add activity button in header).
  const [quickLogAnchor, setQuickLogAnchor] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  function openQuickLog() {
    const btn = addActivityBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setQuickLogAnchor({
      left: rect.left,
      top: rect.bottom + 6,
      width: rect.width,
    });
  }

  async function refreshActivities() {
    const updated = await getDealActivities(deal.id);
    setActivities(updated);
  }

  function handleMarkScheduledDone(activityId: string) {
    // optimistic flip
    setActivities((prev) =>
      prev.map((a) =>
        a.id === activityId
          ? { ...a, status: "done" as ActivityStatus, occurred_at: new Date().toISOString() }
          : a
      )
    );
    startTransition(async () => {
      try {
        await completeScheduledActivity(activityId);
      } finally {
        await refreshActivities();
      }
    });
  }

  const currentStage = stages.find((s) => s.id === deal.stage_id);
  const activeStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const wonStage = stages.find((s) => s.is_won);
  const isWon = !!deal.won_at;
  const isLost = !!deal.lost_at;
  const isClosed = isWon || isLost;

  // Load activities
  useEffect(() => {
    setLoadingActivities(true);
    getDealActivities(deal.id)
      .then(setActivities)
      .finally(() => setLoadingActivities(false));
  }, [deal.id]);

  // Auto-scroll timeline to bottom
  useEffect(() => {
    if (timelineRef.current && !loadingActivities) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [loadingActivities, activities.length]);

  // Build timeline events (chronological, oldest first)
  const timelineEvents = useMemo(() => {
    const created = {
      id: "created",
      type: "created" as TimelineEventType,
      summary: `Deal created for ${deal.contact_name}`,
      notes: deal.company ? `Company: ${deal.company}` : null,
      occurred_at: deal.created_at,
      stage_from: null as string | null,
      stage_to: null as string | null,
      email_subject: null as string | null,
      call_direction: null as string | null,
      call_duration_seconds: null as number | null,
      status: "done" as ActivityStatus,
      scheduled_at: null as string | null,
    };
    const mapped = activities.map((a) => ({
      id: a.id,
      type: a.type as TimelineEventType,
      summary: a.summary,
      notes: a.notes,
      occurred_at: a.occurred_at,
      stage_from: a.stage_from,
      stage_to: a.stage_to,
      email_subject: a.email_subject,
      call_direction: a.call_direction as string | null,
      call_duration_seconds: a.call_duration_seconds,
      status: a.status,
      scheduled_at: a.scheduled_at,
    }));
    const events = [created, ...mapped];
    events.sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
    return events;
  }, [activities, deal]);

  function handleStageChange(stageId: string) {
    if (stageId === deal.stage_id || isClosed) return;
    startTransition(() => moveDeal(deal.id, stageId));
  }

  function handleMarkWon() {
    if (!wonStage) return;
    startTransition(() => moveDeal(deal.id, wonStage.id));
  }

  function handleMarkLost(reasonId: string) {
    startTransition(async () => {
      await markDealLost(deal.id, reasonId);
      lossMenu.setOpen(false);
    });
  }

  function handleLogActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    startTransition(async () => {
      await logActivity({ deal_id: deal.id, type: actType, summary: summary.trim() });
      setSummary("");
      const updated = await getDealActivities(deal.id);
      setActivities(updated);
    });
  }

  function handleSetFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpDate) return;
    startTransition(async () => {
      await setFollowUp(deal.id, followUpDate, followUpNote || undefined);
      setShowFollowUp(false);
      setFollowUpDate("");
      setFollowUpNote("");
      const updated = await getDealActivities(deal.id);
      setActivities(updated);
    });
  }

  function startEditing(field: string, currentValue: string) {
    setEditingField(field);
    setEditValue(currentValue);
  }

  function saveEdit(field: string) {
    if (editingField !== field) return;
    startTransition(async () => {
      if (field === "deal_value") {
        const num = parseFloat(editValue.replace(/[^0-9.-]/g, ""));
        await updateDeal(deal.id, { deal_value: isNaN(num) ? null : num });
      } else {
        await updateDeal(deal.id, { [field]: editValue.trim() || null } as Record<string, string | null>);
      }
      setEditingField(null);
    });
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  return (
    <div className="fixed inset-0 z-60 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel container */}
      <div className="relative ml-auto flex h-full w-full max-w-275 animate-in slide-in-from-right-4 duration-200">
        {/* ── Left: Client Timeline (alternating cards) ── */}
        <div className="hidden lg:flex w-105 shrink-0 bg-(--color-surface-1)/95 backdrop-blur-md border-r border-(--color-border)/10 flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-(--color-border)/10 shrink-0">
            <h2 className="font-semibold text-base text-(--color-fg) tracking-tight">Client Timeline</h2>
            <p className="text-xs text-(--color-fg-muted) mt-0.5">Full activity history</p>
          </div>
          <div ref={timelineRef} className="flex-1 overflow-y-auto py-8 px-5" style={{ scrollbarWidth: "thin" }}>
            {loadingActivities ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-(--color-accent)/30 border-t-(--color-accent) rounded-full animate-spin" />
              </div>
            ) : timelineEvents.length === 0 ? (
              <p className="text-sm text-(--color-fg-subtle) text-center py-12">No activity yet</p>
            ) : (
              <div className="relative">
                {/* Center vertical line — runs full height */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-linear-to-b from-transparent via-(--color-border)/25 to-transparent" />

                {timelineEvents.map((event, i) => {
                  const isLeft = i % 2 === 0;
                  return (
                    <div
                      key={event.id}
                      className="relative grid grid-cols-[1fr_24px_1fr] items-start mb-10 last:mb-0"
                    >
                      {/* Left column */}
                      <div className={isLeft ? "pr-3" : ""}>
                        {isLeft && (
                          <TimelineCard event={event} onMarkDone={handleMarkScheduledDone} />
                        )}
                      </div>

                      {/* Center dot column */}
                      <div className="flex justify-center pt-4">
                        <div
                          className={cn(
                            "w-3 h-3 rounded-full ring-[3px] ring-(--color-surface-1) relative z-10",
                            event.type === "won" ? "bg-(--color-success)" :
                            event.type === "lost" ? "bg-(--color-danger)" :
                            event.type === "created" ? "bg-(--color-accent)" :
                            "bg-(--color-fg-subtle)/60"
                          )}
                        />
                      </div>

                      {/* Right column */}
                      <div className={!isLeft ? "pl-3" : ""}>
                        {!isLeft && (
                          <TimelineCard event={event} onMarkDone={handleMarkScheduledDone} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="flex-1 bg-(--color-bg) flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-6 pb-5 shrink-0 border-b border-(--color-border)/10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-(--color-fg) leading-tight">
                  {deal.contact_name}
                </h1>
                <p className="text-(--color-fg-muted) text-sm mt-1 font-medium">
                  {[deal.company, currentStage?.name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  ref={addActivityBtnRef}
                  type="button"
                  onClick={openQuickLog}
                  className="h-9 px-4 rounded-full bg-(--color-accent) text-(--color-accent-fg) text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add activity
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-surface-3) transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Pipeline stage indicator */}
            {!isClosed && (
              <>
                <div className="mb-4">
                  <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-2">
                    Pipeline Stage
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {activeStages.map((stage, i) => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => handleStageChange(stage.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                          stage.id === deal.stage_id
                            ? "bg-(--color-accent) text-(--color-accent-fg) shadow-sm"
                            : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
                        )}
                      >
                        {stage.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick actions: Mark Won / Mark Lost */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMarkWon}
                    className="flex-1 bg-(--color-success) text-white text-sm font-medium py-2.5 rounded-full hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as Won
                  </button>
                  <div className="relative flex-1" ref={lossMenu.ref}>
                    <button
                      type="button"
                      onClick={() => lossMenu.setOpen(!lossMenu.open)}
                      className="w-full border border-(--color-border)/20 text-(--color-fg-muted) text-sm font-medium py-2.5 rounded-full hover:bg-(--color-danger)/10 hover:text-(--color-danger) hover:border-(--color-danger)/30 transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle className="h-4 w-4" />
                      Mark as Lost
                    </button>
                    {lossMenu.open && (
                      <div className="absolute left-0 right-0 top-full mt-2 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-2 z-50">
                        <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle)">
                          Select Reason
                        </p>
                        {lossReasons.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleMarkLost(r.id)}
                            className="w-full text-left px-4 py-2 text-sm text-(--color-fg) hover:bg-(--color-surface-3) transition-colors"
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Won/Lost status badge */}
            {isClosed && (
              <div
                className={cn(
                  "rounded-xl p-4 flex items-center gap-3",
                  isWon
                    ? "bg-(--color-success)/10 border border-(--color-success)/30"
                    : "bg-(--color-danger)/10 border border-(--color-danger)/30"
                )}
              >
                {isWon ? (
                  <CheckCircle2 className="h-6 w-6 text-(--color-success)" />
                ) : (
                  <XCircle className="h-6 w-6 text-(--color-danger)" />
                )}
                <div>
                  <p className={cn("font-semibold", isWon ? "text-(--color-success)" : "text-(--color-danger)")}>
                    {isWon ? "Deal Won" : "Deal Lost"}
                  </p>
                  <p className="text-xs text-(--color-fg-muted)">
                    {new Date((isWon ? deal.won_at : deal.lost_at)!).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="px-8 border-b border-(--color-border)/10 flex gap-6 shrink-0">
            {(["details", "activity"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={cn(
                  "pb-3 text-sm font-medium capitalize border-b-2 transition-colors",
                  activeTab === t
                    ? "text-(--color-fg) border-(--color-accent)"
                    : "text-(--color-fg-muted) border-transparent hover:text-(--color-fg)"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
            {activeTab === "details" && (
              <>
                {/* Deal value & follow-up */}
                <div className="grid grid-cols-2 gap-8">
                  <div
                    className="group cursor-pointer"
                    onClick={() => !editingField && startEditing("deal_value", deal.deal_value?.toString() || "")}
                  >
                    <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1 group-hover:text-(--color-accent) transition-colors">
                      Deal Value
                    </p>
                    {editingField === "deal_value" ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit("deal_value");
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                          className="w-full h-9 rounded-lg bg-(--color-surface-2) border border-(--color-accent)/50 px-3 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                          placeholder="e.g. 125000"
                        />
                        <button type="button" onClick={() => saveEdit("deal_value")} className="text-(--color-accent) text-xs font-medium hover:underline shrink-0">
                          Save
                        </button>
                      </div>
                    ) : (
                      <p className="text-xl font-semibold text-(--color-fg)">
                        {deal.deal_value != null ? formatDealValue(deal.deal_value, deal.currency) : "—"}
                      </p>
                    )}
                  </div>
                  {deal.follow_up_at && (
                    <div>
                      <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1">
                        Next Follow-up
                      </p>
                      <p className="text-[17px] text-(--color-fg)">
                        {new Date(deal.follow_up_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {deal.follow_up_note && (
                        <p className="text-xs text-(--color-fg-muted) mt-1">{deal.follow_up_note}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Contact information */}
                <div>
                  <h3 className="font-semibold text-base text-(--color-fg) mb-4 tracking-tight">Contact Information</h3>
                  <div className="space-y-3">
                    {/* Email */}
                    <div
                      className="group flex items-start gap-4 cursor-pointer"
                      onClick={() => !editingField && startEditing("email", deal.email || "")}
                    >
                      <div className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) shrink-0 mt-0.5">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1 group-hover:text-(--color-accent) transition-colors">
                          Email Address
                        </p>
                        {editingField === "email" ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit("email");
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                              className="w-full h-8 rounded-lg bg-(--color-surface-2) border border-(--color-accent)/50 px-3 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                            />
                            <button type="button" onClick={() => saveEdit("email")} className="text-(--color-accent) text-xs font-medium hover:underline shrink-0">
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="text-[15px] text-(--color-fg)">{deal.email || "—"}</p>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    <div
                      className="group flex items-start gap-4 cursor-pointer"
                      onClick={() => !editingField && startEditing("phone", deal.phone || "")}
                    >
                      <div className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) shrink-0 mt-0.5">
                        <Phone className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1 group-hover:text-(--color-accent) transition-colors">
                          Phone Number
                        </p>
                        {editingField === "phone" ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="tel"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit("phone");
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                              className="w-full h-8 rounded-lg bg-(--color-surface-2) border border-(--color-accent)/50 px-3 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                            />
                            <button type="button" onClick={() => saveEdit("phone")} className="text-(--color-accent) text-xs font-medium hover:underline shrink-0">
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="text-[15px] text-(--color-fg)">{deal.phone || "—"}</p>
                        )}
                      </div>
                    </div>

                    {/* LinkedIn */}
                    {deal.linkedin_url && (
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) shrink-0 mt-0.5">
                          <Star className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1">LinkedIn</p>
                          <a
                            href={deal.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[15px] text-(--color-accent) hover:underline"
                          >
                            View Profile
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Website */}
                    {deal.website && (
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) shrink-0 mt-0.5">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1">Website</p>
                          <a
                            href={deal.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[15px] text-(--color-accent) hover:underline"
                          >
                            {deal.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Decision Maker */}
                    {deal.decision_maker && (
                      <div className="flex items-start gap-4">
                        <div className="w-9 h-9 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) shrink-0 mt-0.5">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-1">Decision Maker</p>
                          <p className="text-[15px] text-(--color-fg)">{deal.decision_maker}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deal Context / Notes */}
                <div>
                  <h3 className="font-semibold text-base text-(--color-fg) mb-4 tracking-tight">Deal Context</h3>
                  <div
                    className="group cursor-pointer"
                    onClick={() => !editingField && startEditing("notes", deal.notes || "")}
                  >
                    <p className="text-xs font-medium tracking-[0.08em] uppercase text-(--color-fg-subtle) mb-2 group-hover:text-(--color-accent) transition-colors">
                      Notes
                    </p>
                    {editingField === "notes" ? (
                      <div className="space-y-2">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                          rows={4}
                          className="w-full rounded-xl bg-(--color-surface-2) border border-(--color-accent)/50 p-4 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent) resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={cancelEdit} className="text-xs text-(--color-fg-muted) hover:underline">
                            Cancel
                          </button>
                          <button type="button" onClick={() => saveEdit("notes")} className="text-(--color-accent) text-xs font-medium hover:underline">
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-(--color-surface-1) border border-(--color-border)/10 group-hover:border-(--color-border)/30 transition-colors">
                        <p className="text-[15px] leading-relaxed text-(--color-fg-muted) whitespace-pre-wrap">
                          {deal.notes || "No notes yet. Click to add."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete deal */}
                <div className="pt-4 border-t border-(--color-border)/15">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 text-sm text-(--color-danger) hover:underline"
                    >
                      <Trash2 className="h-4 w-4" /> Delete deal
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-(--color-danger)">Delete this deal?</span>
                      <button
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteDeal(deal.id);
                            onClose();
                          });
                        }}
                        className="rounded-lg bg-(--color-danger) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-(--color-fg-muted) hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Spacer for bottom bar */}
                <div className="h-16" />
              </>
            )}

            {activeTab === "activity" && (
              <div className="space-y-6">
                {/* Log activity form */}
                <form onSubmit={handleLogActivity} className="space-y-3">
                  <div className="flex gap-2">
                    {([
                      { val: "call" as const, Icon: Phone, label: "Call" },
                      { val: "email" as const, Icon: Mail, label: "Email" },
                      { val: "note" as const, Icon: StickyNote, label: "Note" },
                    ]).map(({ val, Icon, label }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setActType(val)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                          actType === val
                            ? "bg-(--color-accent)/15 text-(--color-accent)"
                            : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Log a ${actType}…`}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" size="sm" disabled={!summary.trim()}>
                      Log
                    </Button>
                  </div>
                </form>

                {/* Activity list */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle) mb-3">
                    Recent Activity
                  </h4>
                  {loadingActivities ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-(--color-accent)/30 border-t-(--color-accent) rounded-full animate-spin" />
                    </div>
                  ) : activities.length === 0 ? (
                    <p className="text-sm text-(--color-fg-subtle) text-center py-8">No activity logged yet</p>
                  ) : (
                    <div className="space-y-1">
                      {activities.map((a) => {
                        const isScheduled = a.status === "scheduled";
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "flex items-start gap-3 py-3 border-b border-(--color-border)/10 last:border-b-0",
                              isScheduled && "bg-(--color-info)/5 -mx-2 px-2 rounded-lg border-b-transparent"
                            )}
                          >
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", getTimelineColor(a.type))}>
                              {getTimelineIcon(a.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-medium text-(--color-fg) truncate">{getTimelineTitle(a.type)}</p>
                                  {isScheduled && (
                                    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-(--color-info)/15 text-(--color-info) shrink-0">
                                      Scheduled · {relativeTime(a.scheduled_at ?? a.occurred_at)}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-(--color-fg-subtle) shrink-0">{relativeTime(a.occurred_at)}</span>
                              </div>
                              {a.summary && <p className="text-sm text-(--color-fg-muted) mt-0.5">{a.summary}</p>}
                              {a.notes && <p className="text-xs text-(--color-fg-subtle) mt-1">{a.notes}</p>}
                              {isScheduled && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkScheduledDone(a.id)}
                                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-info) hover:underline"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark done
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Spacer for bottom bar */}
                <div className="h-16" />
              </div>
            )}
          </div>

          {/* Fixed bottom bar */}
          <div className="shrink-0 border-t border-(--color-border)/15 bg-(--color-bg)/80 backdrop-blur-xl px-8 py-4 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setActType("call"); setActiveTab("activity"); }}
                className="px-4 py-2 rounded-full text-sm font-medium bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors flex items-center gap-2"
              >
                <Phone className="h-4 w-4" /> Log Call
              </button>
              <button
                type="button"
                onClick={() => { setActType("email"); setActiveTab("activity"); }}
                className="px-4 py-2 rounded-full text-sm font-medium bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors flex items-center gap-2"
              >
                <Mail className="h-4 w-4" /> Log Email
              </button>
              <button
                type="button"
                onClick={() => { setActType("note"); setActiveTab("activity"); }}
                className="w-10 h-10 rounded-full bg-(--color-surface-2) flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
                title="Add Note"
              >
                <StickyNote className="h-4 w-4" />
              </button>
            </div>
            {showFollowUp ? (
              <form onSubmit={handleSetFollowUp} className="flex items-center gap-2">
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="h-8 rounded-lg bg-(--color-surface-2) border border-(--color-accent)/50 px-3 text-xs text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                  autoFocus
                />
                <button type="submit" disabled={!followUpDate} className="text-(--color-accent) text-xs font-medium hover:underline disabled:opacity-40">
                  Set
                </button>
                <button type="button" onClick={() => setShowFollowUp(false)} className="text-xs text-(--color-fg-muted) hover:underline">
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowFollowUp(true)}
                className="text-(--color-accent) font-medium text-sm hover:underline flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-(--color-accent)/10 transition-colors"
              >
                <Calendar className="h-4 w-4" /> Set Follow-up
              </button>
            )}
          </div>
        </div>
      </div>
      {quickLogAnchor && (
        <QuickLogPopover
          dealId={deal.id}
          anchorRect={quickLogAnchor}
          onClose={() => setQuickLogAnchor(null)}
          onLogged={refreshActivities}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main pipeline view
// ─────────────────────────────────────────────
export function PipelineView({
  pipelines,
  stages,
  initialDeals,
  lossReasons,
  savedViews,
  currentUserId,
}: {
  pipelines: Pipeline[];
  stages: PipelineStage[];
  initialDeals: Deal[];
  lossReasons: LossReason[];
  savedViews: import("../saved-views/actions").SavedView[];
  currentUserId: string | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pidFromUrl = searchParams.get("pid");
  const stageFromUrl = searchParams.get("stage");
  const closedFromUrl = searchParams.get("closed") === "1";
  const viewFromUrl = searchParams.get("view") === "list" ? "list" : "kanban";
  const [view, setView] = useState<ViewMode>(viewFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showClosed, setShowClosed] = useState(closedFromUrl);
  const [filterStageId, setFilterStageId] = useState<string | null>(stageFromUrl);
  const [, startTransition] = useTransition();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const filterMenu = useDropdown();
  const pipelineMenu = useDropdown();

  // Bulk selection
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const bulkActionsMenu = useDropdown();

  // Quick-log popover (anchored to the trigger button on a DealCard)
  const [quickLogFor, setQuickLogFor] = useState<{
    dealId: string;
    anchorRect: { left: number; top: number; width: number };
  } | null>(null);

  // Saved view — tracks which view's filters are currently applied so the
  // picker can show a check next to it. Cleared whenever the user tweaks
  // any filter manually.
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  // Column limit — show N deals per column, rest queued
  const COLUMN_LIMIT = 50;
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  // Pipeline state — read pid from URL, fallback to default
  const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
  const initialPipelineId = pidFromUrl && pipelines.some(p => p.id === pidFromUrl)
    ? pidFromUrl
    : defaultPipeline?.id ?? "";
  const [activePipelineId, setActivePipelineId] = useState(initialPipelineId);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [deletingPipelineId, setDeletingPipelineId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Sync activePipelineId when URL pid changes
  useEffect(() => {
    if (pidFromUrl && pipelines.some(p => p.id === pidFromUrl)) {
      setActivePipelineId(pidFromUrl);
    }
  }, [pidFromUrl, pipelines]);

  // Persist filter / view / closed toggle back to the URL so refreshes
  // and shared links reproduce the same view.
  useEffect(() => {
    const params = new URLSearchParams();
    if (activePipelineId) params.set("pid", activePipelineId);
    if (filterStageId) params.set("stage", filterStageId);
    if (showClosed) params.set("closed", "1");
    if (view === "list") params.set("view", "list");
    const qs = params.toString();
    const current = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    if (qs !== current) {
      router.replace(qs ? `/pipeline?${qs}` : "/pipeline", { scroll: false });
    }
  }, [activePipelineId, filterStageId, showClosed, view, router]);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId);
  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === activePipelineId),
    [stages, activePipelineId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Optimistic stage overrides: dealId → newStageId (for instant DnD feedback)
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  // Pending Lost-stage move — shown in LossReasonDialog until confirmed/cancelled.
  // For single deal: { dealIds: [id], targetStageId }; for bulk: multiple ids.
  const [pendingLost, setPendingLost] = useState<{
    dealIds: string[];
    targetStageId: string;
    dealName?: string;
  } | null>(null);

  const deals = useMemo(() => {
    let result = initialDeals.map((d) =>
      optimisticMoves[d.id] ? { ...d, stage_id: optimisticMoves[d.id] } : d
    );
    // Filter to current pipeline's stages
    const stageIds = new Set(pipelineStages.map((s) => s.id));
    result = result.filter((d) => stageIds.has(d.stage_id));
    if (!showClosed) result = result.filter((d) => !d.won_at && !d.lost_at);
    if (filterStageId) result = result.filter((d) => d.stage_id === filterStageId);
    return result;
  }, [initialDeals, optimisticMoves, showClosed, filterStageId, pipelineStages]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of pipelineStages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    return map;
  }, [pipelineStages, deals]);

  // Visible deals per stage (column limit)
  const visibleDealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const [stageId, stageDeals] of Object.entries(dealsByStage)) {
      map[stageId] = expandedColumns.has(stageId)
        ? stageDeals
        : stageDeals.slice(0, COLUMN_LIMIT);
    }
    return map;
  }, [dealsByStage, expandedColumns, COLUMN_LIMIT]);

  // Bulk selection helpers
  const toggleDealSelection = useCallback((dealId: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }, []);

  const selectAllInStage = useCallback((stageId: string) => {
    const stageDeals = dealsByStage[stageId] ?? [];
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      const allSelected = stageDeals.every((d) => prev.has(d.id));
      if (allSelected) {
        stageDeals.forEach((d) => next.delete(d.id));
      } else {
        stageDeals.forEach((d) => next.add(d.id));
      }
      return next;
    });
  }, [dealsByStage]);

  const clearSelection = useCallback(() => {
    setSelectedDealIds(new Set());
    setBulkMode(false);
  }, []);

  async function bulkMoveDeals(targetStageId: string) {
    const ids = Array.from(selectedDealIds);
    const targetStage = pipelineStages.find((s) => s.id === targetStageId);
    // If moving to Lost stage, require a single shared loss reason for all
    if (targetStage?.is_lost) {
      setPendingLost({ dealIds: ids, targetStageId });
      return;
    }
    startTransition(async () => {
      for (const id of ids) {
        await moveDeal(id, targetStageId);
      }
      clearSelection();
    });
  }

  async function bulkDeleteDeals() {
    const ids = Array.from(selectedDealIds);
    startTransition(async () => {
      for (const id of ids) {
        await deleteDeal(id);
      }
      clearSelection();
    });
  }

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
    const isStage = pipelineStages.some((s) => s.id === over.id);
    if (isStage) {
      targetStageId = over.id as string;
    } else {
      // Dropped on another deal — find which stage that deal is in
      const targetDeal = deals.find((d) => d.id === over.id);
      if (targetDeal) targetStageId = targetDeal.stage_id;
    }

    if (targetStageId) {
      const targetStage = pipelineStages.find((s) => s.id === targetStageId);
      // Block drags into a Lost stage until user picks a loss reason.
      if (targetStage?.is_lost) {
        const deal = deals.find((d) => d.id === dealId);
        setPendingLost({
          dealIds: [dealId],
          targetStageId,
          dealName: deal?.contact_name,
        });
        return;
      }
      // Optimistic: move card instantly in the UI
      setOptimisticMoves((prev) => ({ ...prev, [dealId]: targetStageId }));
      startTransition(async () => {
        await moveDeal(dealId, targetStageId);
        // Clear optimistic override after server confirms (revalidation provides new data)
        setOptimisticMoves((prev) => {
          const next = { ...prev };
          delete next[dealId];
          return next;
        });
      });
    }
  }

  const draggedDeal = activeDragId
    ? deals.find((d) => d.id === activeDragId)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-8 md:px-12 h-24 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-3xl tracking-tight text-(--color-fg)">
            Pipeline
          </h1>

          {/* Pipeline selector */}
          {pipelines.length > 0 && (
            <div className="relative" ref={pipelineMenu.ref}>
              <button
                type="button"
                onClick={() => pipelineMenu.setOpen(!pipelineMenu.open)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-(--color-card-border) bg-(--color-surface-1) hover:bg-(--color-surface-2) transition-colors text-sm font-medium text-(--color-fg)"
              >
                {activePipeline?.name ?? "Select Pipeline"}
                <ChevronDown className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
              {pipelineMenu.open && (
                <div className="absolute left-0 top-full mt-2 w-64 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-2 z-50">
                  <div className="px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle)">Pipelines</span>
                  </div>
                  {pipelines.map((p) => (
                    <div key={p.id} className="flex items-center group">
                      <button
                        type="button"
                        onClick={() => { setActivePipelineId(p.id); setFilterStageId(null); pipelineMenu.setOpen(false); router.push(`/pipeline?pid=${p.id}`, { scroll: false }); }}
                        className={cn(
                          "flex-1 text-left px-4 py-2 text-sm transition-colors flex items-center justify-between",
                          p.id === activePipelineId
                            ? "text-(--color-accent) bg-(--color-accent-muted)"
                            : "text-(--color-fg) hover:bg-(--color-surface-3)"
                        )}
                      >
                        <span>{p.name}</span>
                        {p.is_default && (
                          <span className="text-[10px] text-(--color-fg-subtle) uppercase tracking-wider">Default</span>
                        )}
                      </button>
                      {!p.is_default && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeletingPipelineId(p.id); setDeleteConfirmName(""); }}
                          className="shrink-0 px-2 py-2 text-(--color-fg-subtle) hover:text-(--color-danger) hover:bg-(--color-danger)/10 rounded-lg transition-colors mr-1"
                          title="Delete pipeline"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-(--color-border)/15 my-1" />
                  {showNewPipeline ? (
                    <div className="px-4 py-2 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Pipeline name"
                        value={newPipelineName}
                        onChange={(e) => setNewPipelineName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newPipelineName.trim()) {
                            startTransition(async () => {
                              await createPipeline(newPipelineName.trim());
                              setNewPipelineName("");
                              setShowNewPipeline(false);
                              pipelineMenu.setOpen(false);
                            });
                          }
                          if (e.key === "Escape") setShowNewPipeline(false);
                        }}
                        autoFocus
                        className="flex-1 h-8 rounded-lg bg-(--color-surface-2) border-none px-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newPipelineName.trim()) {
                            startTransition(async () => {
                              await createPipeline(newPipelineName.trim());
                              setNewPipelineName("");
                              setShowNewPipeline(false);
                              pipelineMenu.setOpen(false);
                            });
                          }
                        }}
                        className="text-sm text-(--color-accent) font-medium hover:underline"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewPipeline(true)}
                      className="w-full text-left px-4 py-2 text-sm text-(--color-accent) hover:bg-(--color-surface-3) transition-colors flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5" /> New Pipeline
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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

          {/* Saved views */}
          <SavedViewPicker
            scope="pipeline"
            scopeRef={null}
            initialViews={savedViews}
            activeViewId={activeSavedViewId}
            currentUserId={currentUserId}
            currentFilters={{
              activePipelineId,
              filterStageId,
              showClosed,
              view,
            }}
            onApply={(v) => {
              setActiveSavedViewId(v?.id ?? null);
              if (!v) {
                setFilterStageId(null);
                setShowClosed(false);
                return;
              }
              const f = v.filters as {
                activePipelineId?: string;
                filterStageId?: string | null;
                showClosed?: boolean;
                view?: ViewMode;
              };
              if (f.activePipelineId && pipelines.some((p) => p.id === f.activePipelineId)) {
                setActivePipelineId(f.activePipelineId);
              }
              setFilterStageId(f.filterStageId ?? null);
              setShowClosed(!!f.showClosed);
              if (f.view === "list" || f.view === "kanban") setView(f.view);
            }}
          />

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
                {pipelineStages.map((s) => (
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

          {/* Bulk mode toggle */}
          <Button
            size="sm"
            variant={bulkMode ? "primary" : "outline"}
            onClick={() => {
              if (bulkMode) clearSelection();
              else setBulkMode(true);
            }}
            className="hidden md:flex"
          >
            <CheckSquare className="h-4 w-4" /> {bulkMode ? "Exit Select" : "Select"}
          </Button>

          {/* Export CSV */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (deals.length === 0) return;
              const stageMap = Object.fromEntries(
                pipelineStages.map((s) => [s.id, s.name])
              );
              const rows = deals.map((d) => ({
                "Contact Name": csvCell(d.contact_name),
                Company: csvCell(d.company),
                Email: csvCell(d.email),
                Phone: csvCell(d.phone),
                Website: csvCell(d.website),
                LinkedIn: csvCell(d.linkedin_url),
                "Decision Maker": csvCell(d.decision_maker),
                Stage: csvCell(stageMap[d.stage_id] ?? ""),
                "Deal Value": csvCell(d.deal_value),
                Currency: csvCell(d.currency),
                "Follow-up At": csvCell(d.follow_up_at),
                "Won At": csvCell(d.won_at),
                "Lost At": csvCell(d.lost_at),
                "Stage Entered": csvCell(d.stage_entered_at),
                "Last Activity": csvCell(d.last_activity_at),
                "Created At": csvCell(d.created_at),
                Notes: csvCell(d.notes),
              }));
              downloadCsv(
                timestampedFilename(
                  `pipeline-${activePipeline?.name ?? "deals"}`.replace(/\s+/g, "-").toLowerCase()
                ),
                rows
              );
            }}
            className="hidden md:flex"
          >
            <Download className="h-4 w-4" /> Export
          </Button>

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

      {/* Bulk actions toolbar */}
      {bulkMode && (
        <div className="flex items-center gap-4 px-8 md:px-12 py-3 bg-(--color-surface-2)/60 border-b border-(--color-border)/20">
          <span className="text-sm font-medium text-(--color-fg)">
            {selectedDealIds.size} selected
          </span>
          <div className="relative" ref={bulkActionsMenu.ref}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkActionsMenu.setOpen(!bulkActionsMenu.open)}
              disabled={selectedDealIds.size === 0}
            >
              <ArrowRight className="h-3.5 w-3.5" /> Move to stage
            </Button>
            {bulkActionsMenu.open && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-1 z-50">
                {pipelineStages.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { bulkMoveDeals(s.id); bulkActionsMenu.setOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-(--color-fg) hover:bg-(--color-surface-3) transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={bulkDeleteDeals}
            disabled={selectedDealIds.size === 0}
            className="text-(--color-danger) border-(--color-danger)/30 hover:bg-(--color-danger)/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      )}

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
              {pipelineStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={visibleDealsByStage[stage.id] ?? []}
                  totalCount={(dealsByStage[stage.id] ?? []).length}
                  onCardClick={setSelectedDeal}
                  onCreateInStage={(stageId) => {
                    setCreateStageId(stageId);
                    setCreateOpen(true);
                  }}
                  onExpandColumn={() => {
                    setExpandedColumns((prev) => {
                      const next = new Set(prev);
                      if (next.has(stage.id)) next.delete(stage.id);
                      else next.add(stage.id);
                      return next;
                    });
                  }}
                  isExpanded={expandedColumns.has(stage.id)}
                  bulkMode={bulkMode}
                  selectedDealIds={selectedDealIds}
                  onToggleSelect={toggleDealSelection}
                  onSelectAll={() => selectAllInStage(stage.id)}
                  onQuickLog={(dealId, rect) =>
                    setQuickLogFor({
                      dealId,
                      anchorRect: {
                        left: rect.left,
                        top: rect.bottom + 6,
                        width: rect.width,
                      },
                    })
                  }
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
                const stage = pipelineStages.find((s) => s.id === deal.stage_id);
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
        stages={pipelineStages}
        defaultStageId={createStageId}
      />

      {/* Deal detail panel */}
      {selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          stages={pipelineStages}
          lossReasons={lossReasons}
          onClose={() => setSelectedDeal(null)}
        />
      )}

      {/* Loss-reason gate — required before any deal can enter the Lost stage */}
      <LossReasonDialog
        open={!!pendingLost}
        lossReasons={lossReasons}
        dealName={pendingLost?.dealName}
        dealCount={pendingLost?.dealIds.length}
        onCancel={() => setPendingLost(null)}
        onConfirm={async (reasonId) => {
          if (!pendingLost) return;
          const { dealIds, targetStageId } = pendingLost;
          // Optimistic UI for single-deal case
          if (dealIds.length === 1) {
            setOptimisticMoves((prev) => ({ ...prev, [dealIds[0]]: targetStageId }));
          }
          try {
            for (const id of dealIds) {
              await moveDeal(id, targetStageId, { lossReasonId: reasonId });
            }
          } finally {
            if (dealIds.length === 1) {
              setOptimisticMoves((prev) => {
                const next = { ...prev };
                delete next[dealIds[0]];
                return next;
              });
            }
            if (dealIds.length > 1) clearSelection();
            setPendingLost(null);
          }
        }}
      />

      {/* Inline quick-log popover */}
      {quickLogFor && (
        <QuickLogPopover
          dealId={quickLogFor.dealId}
          anchorRect={quickLogFor.anchorRect}
          onClose={() => setQuickLogFor(null)}
          onLogged={() => router.refresh()}
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

      {/* Delete pipeline confirmation dialog */}
      {deletingPipelineId && (() => {
        const pipelineToDelete = pipelines.find((p) => p.id === deletingPipelineId);
        if (!pipelineToDelete) return null;
        const nameMatches = deleteConfirmName.trim() === pipelineToDelete.name;
        return (
          <Dialog open onOpenChange={() => { setDeletingPipelineId(null); setDeleteConfirmName(""); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Pipeline</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-sm text-(--color-fg-muted) mb-4">
                  This will permanently archive the pipeline <span className="font-semibold text-(--color-fg)">&ldquo;{pipelineToDelete.name}&rdquo;</span> and all its stages. Deals in this pipeline will no longer be visible.
                </p>
                <p className="text-sm text-(--color-fg) mb-2">
                  To confirm, type the full pipeline name:
                </p>
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={pipelineToDelete.name}
                  autoFocus
                  className={cn(
                    "font-mono",
                    deleteConfirmName.trim() && !nameMatches && "border-(--color-danger)/50"
                  )}
                />
                {deleteConfirmName.trim() && !nameMatches && (
                  <p className="text-xs text-(--color-danger) mt-1">Name does not match.</p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setDeletingPipelineId(null); setDeleteConfirmName(""); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!nameMatches}
                  onClick={() => {
                    startTransition(async () => {
                      await deletePipeline(deletingPipelineId);
                      setDeletingPipelineId(null);
                      setDeleteConfirmName("");
                      // Switch to default pipeline if we deleted the active one
                      if (activePipelineId === deletingPipelineId) {
                        const fallback = pipelines.find((p) => p.is_default && p.id !== deletingPipelineId) ?? pipelines.find((p) => p.id !== deletingPipelineId);
                        if (fallback) {
                          setActivePipelineId(fallback.id);
                          router.push(`/pipeline?pid=${fallback.id}`, { scroll: false });
                        }
                      }
                    });
                  }}
                  className="bg-(--color-danger) hover:bg-(--color-danger)/90 text-white border-none"
                >
                  <Trash2 className="h-4 w-4" /> Delete Pipeline
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
