"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FolderOpen,
  CheckCircle2,
  Clock,
  Circle,
  ChevronDown,
  ChevronRight,
  List,
  LayoutGrid,
  Settings2,
  Plus,
  X,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { BatchStatus, FieldDefinition, FieldType } from "@/lib/types";
import type { FolderBatchGroup } from "./actions";
import { getEnrichmentFields } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { createField, getFieldDefinitions } from "../folders/[folderId]/actions";

const STATUS_META: Record<
  BatchStatus,
  { label: string; tone: "neutral" | "accent" | "success"; Icon: React.ElementType }
> = {
  not_started: { label: "Not Started", tone: "neutral", Icon: Circle },
  in_progress: { label: "In Progress", tone: "accent", Icon: Clock },
  complete: { label: "Complete", tone: "success", Icon: CheckCircle2 },
};

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

// ─── Enrichment Fields Manager Dialog ─────────────────────────────────
function EnrichmentFieldsDialog({
  folderId,
  folderName,
  open,
  onOpenChange,
}: {
  folderId: string;
  folderName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enrichmentFields, setEnrichmentFields] = useState<FieldDefinition[]>([]);
  const [allFields, setAllFields] = useState<FieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New field form
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    setIsLoading(true);
    const [enr, all] = await Promise.all([
      getEnrichmentFields(folderId),
      getFieldDefinitions(folderId),
    ]);
    setEnrichmentFields(enr);
    setAllFields(all);
    setIsLoading(false);
  }, [folderId]);

  useEffect(() => {
    if (open) loadFields();
  }, [open, loadFields]);

  // Check for duplicate/similar field names
  function validateFieldName(name: string): string | null {
    const lower = name.toLowerCase().trim();
    if (!lower) return "Field label is required.";

    // Check for exact duplicate
    const existing = allFields.find((f) => f.label.toLowerCase() === lower);
    if (existing) return `A field named "${existing.label}" already exists.`;

    // Check for generic names that conflict with existing similar fields
    const genericTerms = ["email", "phone", "name", "company", "website", "url", "address"];
    for (const term of genericTerms) {
      if (lower === term) {
        const similar = allFields.filter((f) =>
          f.label.toLowerCase().includes(term) || f.key.toLowerCase().includes(term)
        );
        if (similar.length > 0) {
          return `A field containing "${term}" already exists (${similar.map((f) => f.label).join(", ")}). Use a more specific name like "CEO ${name}" or "Decision Maker ${name}".`;
        }
      }
    }

    return null;
  }

  async function handleAddField() {
    const validationError = validateFieldName(label);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    startTransition(async () => {
      await createField(folderId, {
        key,
        label: label.trim(),
        type,
        is_required: isRequired,
        is_enrichment: true,
      });
      setLabel("");
      setType("text");
      setIsRequired(false);
      await loadFields();
      router.refresh();
    });
  }

  // Auto-ensure Comments field exists
  async function handleEnsureComments() {
    const hasComments = allFields.some(
      (f) => f.key === "comments" || f.label.toLowerCase() === "comments"
    );
    if (hasComments) return;

    startTransition(async () => {
      await createField(folderId, {
        key: "comments",
        label: "Comments",
        type: "text",
        is_required: true,
        is_enrichment: true,
      });
      await loadFields();
      router.refresh();
    });
  }

  const hasComments = allFields.some(
    (f) =>
      (f.key === "comments" || f.label.toLowerCase() === "comments") &&
      f.is_enrichment
  );

  const hasEmail = enrichmentFields.some(
    (f) => f.type === "email" || f.label.toLowerCase().includes("email")
  );
  const hasPhone = enrichmentFields.some(
    (f) => f.type === "phone" || f.label.toLowerCase().includes("phone")
  );
  const hasContactMethod = hasEmail || hasPhone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Enrichment Fields — {folderName}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <p className="text-sm text-(--color-fg-muted) py-8 text-center">
              Loading fields…
            </p>
          ) : (
            <div className="space-y-6">
              {/* Warnings */}
              {!hasComments && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-300">
                      Comments field is mandatory
                    </p>
                    <p className="text-xs text-amber-400/70 mt-1">
                      Every enrichment form must include a Comments field.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleEnsureComments}
                    disabled={isPending}
                  >
                    Add Comments
                  </Button>
                </div>
              )}

              {!hasContactMethod && enrichmentFields.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-300">
                      Contact method required
                    </p>
                    <p className="text-xs text-red-400/70 mt-1">
                      Add at least an Email or Phone field so every lead remains actionable.
                    </p>
                  </div>
                </div>
              )}

              {/* Current enrichment fields */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-3">
                  Current Enrichment Fields ({enrichmentFields.length})
                </h4>
                {enrichmentFields.length === 0 ? (
                  <p className="text-sm text-(--color-fg-muted) py-4 text-center bg-(--color-surface-2) rounded-xl">
                    No enrichment fields yet. Add fields below.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {enrichmentFields.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between rounded-xl bg-(--color-surface-2) px-4 py-2.5 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-(--color-fg)">
                            {f.label}
                          </span>
                          <span className="text-xs text-(--color-fg-subtle) bg-(--color-surface-3) px-2 py-0.5 rounded-full">
                            {f.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {f.is_required && (
                            <span className="text-[10px] font-bold text-(--color-accent) uppercase">
                              Required
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new field */}
              <div className="border-t border-(--color-card-border) pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-3">
                  Add Enrichment Field
                </h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input
                      placeholder="Field label (e.g., CEO Email)"
                      value={label}
                      onChange={(e) => {
                        setLabel(e.target.value);
                        setError(null);
                      }}
                      className="flex-1"
                    />
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as FieldType)}
                      className="h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-(--color-fg-muted) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRequired}
                      onChange={(e) => setIsRequired(e.target.checked)}
                      className="accent-(--color-accent)"
                    />
                    Required field
                  </label>

                  {error && (
                    <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleAddField}
            disabled={isPending || !label.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            {isPending ? "Adding…" : "Add Field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Enrichment View ─────────────────────────────────────────────
export function EnrichmentView({ groups }: { groups: FolderBatchGroup[] }) {
  const [filter, setFilter] = useState<"all" | BatchStatus>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<Set<string>>(
    new Set()
  );
  const [fieldsDialog, setFieldsDialog] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  function toggleSidebarFolder(folderId: string) {
    setSidebarCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

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

  // If a folder is selected, only show that folder
  const displayGroups = selectedFolder
    ? filteredGroups.filter((g) => g.folder_id === selectedFolder)
    : filteredGroups;

  const totalBatches = groups.reduce((sum, g) => sum + g.batches.length, 0);

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <div className="w-72 shrink-0 bg-(--color-surface-1) border-r border-(--color-card-border) flex flex-col overflow-hidden">
        <div className="px-5 pt-6 pb-4">
          <h3 className="text-sm font-bold text-(--color-fg) uppercase tracking-wider">
            Folders
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {/* All batches */}
          <button
            type="button"
            onClick={() => setSelectedFolder(null)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              selectedFolder === null
                ? "bg-(--color-accent)/10 text-(--color-accent) font-bold"
                : "text-(--color-fg-muted) hover:bg-(--color-surface-2)"
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">All Batches</span>
            <span className="text-xs text-(--color-fg-subtle)">{totalBatches}</span>
          </button>

          {/* Folder groups */}
          {groups.map((group) => {
            const isOpen = !sidebarCollapsed.has(group.folder_id);
            const isSelected = selectedFolder === group.folder_id;
            const folderTotal = group.batches.reduce((s, b) => s + b.total, 0);
            const folderDone = group.batches.reduce((s, b) => s + b.completed, 0);
            const folderPct = folderTotal > 0 ? Math.round((folderDone / folderTotal) * 100) : 0;

            return (
              <div key={group.folder_id}>
                {/* Folder header */}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleSidebarFolder(group.folder_id)}
                    className="p-1 text-(--color-fg-subtle) hover:text-(--color-fg)"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedFolder(
                        isSelected ? null : group.folder_id
                      )
                    }
                    className={cn(
                      "flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                      isSelected
                        ? "bg-(--color-accent)/10 text-(--color-accent) font-bold"
                        : "text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                    )}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{group.folder_name}</span>
                    <span className="text-[10px] text-(--color-fg-subtle)">
                      {folderPct}%
                    </span>
                  </button>
                </div>

                {/* Expanded: batch list + manage button */}
                {isOpen && (
                  <div className="ml-6 pl-3 border-l border-(--color-card-border) space-y-0.5 mt-0.5">
                    {group.batches.map((batch) => {
                      const meta = STATUS_META[batch.status];
                      const Icon = meta.Icon;
                      return (
                        <Link
                          key={batch.id}
                          href={`/enrichment/${batch.id}`}
                          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) transition-colors"
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="flex-1 truncate">{batch.name}</span>
                          <span className="text-[10px] text-(--color-fg-subtle)">
                            {batch.completed}/{batch.total}
                          </span>
                        </Link>
                      );
                    })}
                    {/* Enrichment Fields button */}
                    <button
                      type="button"
                      onClick={() =>
                        setFieldsDialog({
                          folderId: group.folder_id,
                          folderName: group.folder_name,
                        })
                      }
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-(--color-accent) hover:bg-(--color-accent)/10 transition-colors w-full"
                    >
                      <Settings2 className="h-3 w-3" />
                      <span>Enrichment Fields</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto">
        <div className="pt-8 pb-12 px-6 md:px-12 max-w-6xl mx-auto w-full">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
                {selectedFolder
                  ? groups.find((g) => g.folder_id === selectedFolder)
                      ?.folder_name ?? "Enrichment"
                  : "Enrichment"}
              </h2>
              <p className="text-(--color-fg-muted) text-sm">
                {displayGroups.reduce((s, g) => s + g.batches.length, 0)} batch
                {displayGroups.reduce((s, g) => s + g.batches.length, 0) !== 1
                  ? "es"
                  : ""}
                {!selectedFolder &&
                  ` across ${groups.length} folder${groups.length !== 1 ? "s" : ""}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-xl bg-(--color-surface-2) p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "grid"
                      ? "bg-(--color-surface-3) text-(--color-fg)"
                      : "text-(--color-fg-subtle) hover:text-(--color-fg)"
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "list"
                      ? "bg-(--color-surface-3) text-(--color-fg)"
                      : "text-(--color-fg-subtle) hover:text-(--color-fg)"
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

          {/* Content */}
          {displayGroups.length === 0 ? (
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
              {displayGroups.map((group) => {
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
                    {/* Folder section header (only when viewing all) */}
                    {!selectedFolder && (
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
                            {group.batches.length !== 1 ? "es" : ""} ·{" "}
                            {folderCompleted}/{folderTotal} enriched ({folderPct}
                            %)
                          </p>
                        </div>
                        <div className="w-24">
                          <div className="h-1.5 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                folderPct === 100
                                  ? "bg-emerald-500"
                                  : "bg-(--color-accent)"
                              )}
                              style={{ width: `${folderPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

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
                              className="bg-(--color-surface-1) border border-(--color-card-border) rounded-2xl p-6 flex flex-col gap-4 group/card hover:-translate-y-0.5 transition-all duration-200 hover:shadow-md"
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
                    ) : (
                      /* List view (compact) */
                      <div className="rounded-2xl border border-(--color-card-border) overflow-hidden">
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
                                              ? "bg-emerald-500"
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

      {/* Enrichment Fields Dialog */}
      {fieldsDialog && (
        <EnrichmentFieldsDialog
          folderId={fieldsDialog.folderId}
          folderName={fieldsDialog.folderName}
          open={true}
          onOpenChange={(v) => {
            if (!v) setFieldsDialog(null);
          }}
        />
      )}
    </div>
  );
}
