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
  List,
  LayoutGrid,
  Settings2,
  GripVertical,
  Lock,
  Minus,
  X,
  ChevronDown,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { BatchStatus, FieldDefinition, FieldType } from "@/lib/types";
import type { FolderBatchGroup } from "./actions";
import {
  getFieldDefinitions,
  createField,
  deleteField,
  updateField,
} from "../folders/[folderId]/actions";

// ─── Enrichment Fields Modal ──────────────────────────────────────────
const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

const STANDARD_FIELDS = ["Email", "Name", "LinkedIn URL", "Decision Maker"];

type DraftField = {
  id?: string;
  label: string;
  type: FieldType;
};

function EnrichmentFieldsModal({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [existingFields, setExistingFields] = useState<FieldDefinition[]>([]);
  const [customFields, setCustomFields] = useState<DraftField[]>([]);
  const [typeDropdown, setTypeDropdown] = useState<number | null>(null);

  const loadFields = useCallback(async () => {
    setIsLoading(true);
    const fields = await getFieldDefinitions(folderId);
    setExistingFields(fields);
    const enrichment = fields.filter((f) => f.is_enrichment);
    setCustomFields(
      enrichment.map((f) => ({ id: f.id, label: f.label, type: f.type }))
    );
    setIsLoading(false);
  }, [folderId]);

  useEffect(() => {
    if (open) loadFields();
  }, [open, loadFields]);

  function addRow() {
    setCustomFields((prev) => [...prev, { label: "", type: "text" }]);
  }

  function removeRow(idx: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<DraftField>) {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    );
  }

  function handleApply() {
    startTransition(async () => {
      const existingEnrichment = existingFields.filter((f) => f.is_enrichment);
      const keptIds = new Set(customFields.map((f) => f.id).filter(Boolean));

      for (const ef of existingEnrichment) {
        if (!keptIds.has(ef.id)) {
          await deleteField(ef.id, folderId);
        }
      }

      for (const cf of customFields) {
        if (cf.id) {
          const orig = existingEnrichment.find((f) => f.id === cf.id);
          if (orig && (orig.label !== cf.label || orig.type !== cf.type)) {
            await updateField(cf.id, folderId, { label: cf.label });
          }
        }
      }

      for (const cf of customFields) {
        if (!cf.id && cf.label.trim()) {
          const key = cf.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
          await createField(folderId, {
            key,
            label: cf.label.trim(),
            type: cf.type,
            is_enrichment: true,
          });
        }
      }

      router.refresh();
      onOpenChange(false);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-[640px] bg-(--color-surface-1) rounded-xl shadow-(--shadow-popover) flex flex-col border border-(--color-card-border)/10">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold text-(--color-fg) tracking-tight">
              Configure Enrichment Fields
            </h2>
            <p className="text-[15px] text-(--color-fg-muted) mt-2 font-normal">
              Define the data points your team needs to research for this folder.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-4 flex flex-col gap-8 max-h-[614px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-(--color-fg-muted) py-8 text-center">
              Loading fields…
            </p>
          ) : (
            <>
              {/* Standard Fields */}
              <div>
                <h3 className="text-[13px] font-medium text-(--color-fg-subtle) uppercase tracking-wider mb-4">
                  Standard Fields
                </h3>
                <div className="flex flex-col gap-2">
                  {STANDARD_FIELDS.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-3 rounded-lg bg-(--color-surface-2)"
                    >
                      <span className="text-[15px] text-(--color-fg) font-medium">
                        {name}
                      </span>
                      <Lock className="h-4 w-4 text-(--color-fg-subtle)" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Fields */}
              <div>
                <h3 className="text-[13px] font-medium text-(--color-fg-subtle) uppercase tracking-wider mb-4">
                  Custom Fields
                </h3>
                <div className="flex flex-col gap-3">
                  {customFields.map((field, idx) => (
                    <div key={field.id ?? `new-${idx}`} className="flex items-center gap-4 group">
                      <GripVertical className="h-5 w-5 text-(--color-fg-subtle) cursor-grab opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                      <div className="flex-1 bg-(--color-surface-3) rounded px-3 py-2 border-b border-transparent focus-within:border-(--color-accent) transition-colors">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) =>
                            updateRow(idx, { label: e.target.value })
                          }
                          placeholder="Field Name"
                          className="bg-transparent border-none outline-none text-[15px] text-(--color-fg) w-full p-0 focus:ring-0 placeholder:text-(--color-fg-subtle)"
                        />
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setTypeDropdown(typeDropdown === idx ? null : idx)
                          }
                          className="w-32 bg-(--color-surface-3) rounded px-3 py-2 flex items-center justify-between cursor-pointer text-[15px] text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
                        >
                          <span>
                            {FIELD_TYPE_OPTIONS.find((t) => t.value === field.type)?.label ?? "Type"}
                          </span>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        {typeDropdown === idx && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setTypeDropdown(null)}
                            />
                            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-popover) py-1">
                              {FIELD_TYPE_OPTIONS.map((t) => (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() => {
                                    updateRow(idx, { type: t.value });
                                    setTypeDropdown(null);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-1.5 text-sm hover:bg-(--color-surface-3) transition-colors",
                                    field.type === t.value
                                      ? "text-(--color-accent) font-medium"
                                      : "text-(--color-fg)"
                                  )}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-(--color-surface-3) text-(--color-fg-subtle) hover:text-(--color-danger) transition-colors shrink-0"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-4 flex items-center gap-2 text-(--color-accent) text-[15px] font-medium hover:text-(--color-accent-hover) transition-colors py-2 px-3 rounded-full hover:bg-(--color-accent)/10"
                >
                  <Plus className="h-5 w-5" />
                  Add Custom Field
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-(--color-surface-2) rounded-b-xl flex justify-end gap-4 mt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-6 py-2.5 rounded-full text-[15px] font-medium text-(--color-fg-muted) border border-(--color-card-border)/20 hover:bg-(--color-surface-3) transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isPending}
            className="px-6 py-2.5 rounded-full text-[15px] font-medium text-(--color-accent-fg) bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Apply Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Enrichment View ─────────────────────────────────────────────

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
  const [enrichTarget, setEnrichTarget] = useState<{ folderId: string } | null>(null);

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
                        {group.batches.length !== 1 ? "es" : ""} ·{" "}
                        {folderCompleted}/{folderTotal} enriched ({folderPct}%)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnrichTarget({ folderId: group.folder_id })}
                      className="flex items-center gap-1.5 text-(--color-accent) text-sm font-medium hover:text-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-full hover:bg-(--color-accent)/10"
                    >
                      <Settings2 className="h-4 w-4" />
                      Enrichment Fields
                    </button>
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
                            className="bg-(--color-surface-1) border-2 border-(--color-card-border) rounded-2xl p-6 flex flex-col gap-4 group/card transition-all duration-200 shadow-(--shadow-card-3d) hover:shadow-(--shadow-card-3d-hover) hover:-translate-y-1 active:translate-y-0 active:shadow-(--shadow-btn-active)"
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
                    <div className="rounded-2xl border-2 border-(--color-card-border) overflow-hidden shadow-(--shadow-card-3d)">
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
      {enrichTarget && (
        <EnrichmentFieldsModal
          folderId={enrichTarget.folderId}
          open
          onOpenChange={(v) => !v && setEnrichTarget(null)}
        />
      )}
    </div>
  );
}
