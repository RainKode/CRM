"use client";

import { useState, useTransition, useEffect } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Filter,
  ArrowUpDown,
  Layers,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FieldDefinition, Folder } from "@/lib/types";
import { getFilteredLeadIds } from "./actions";
import { createMultipleBatches } from "@/app/(authenticated)/enrichment/actions";
import { useRouter } from "next/navigation";

type Step = "filter" | "batch" | "review";

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "filter", label: "Filter & Sort", icon: Filter },
  { key: "batch", label: "Batch Size", icon: Layers },
  { key: "review", label: "Review & Create", icon: Sparkles },
];

export function BatchCreationWizard({
  folder,
  fields,
  totalCount,
  onClose,
}: {
  folder: Folder;
  fields: FieldDefinition[];
  totalCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("filter");
  const [isPending, startTransition] = useTransition();

  // Step 1: Filter & Sort
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  // Step 2: Batch sizing
  const [batchSize, setBatchSize] = useState(200);
  const [namePrefix, setNamePrefix] = useState(folder.name);

  // Step 3: Review
  const [filteredIds, setFilteredIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const effectiveCount = filteredCount ?? totalCount;
  const totalBatches = batchSize > 0 ? Math.ceil(effectiveCount / batchSize) : 0;
  const lastBatchSize = effectiveCount % batchSize || batchSize;

  // Sortable fields = top-level columns + all non-hidden field definitions
  const sortableFields = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "created_at", label: "Date Added" },
    ...fields
      .filter((f) => !f.is_hidden)
      .map((f) => ({ key: f.key, label: f.label })),
  ];

  async function handlePreviewCount() {
    setIsLoadingCount(true);
    try {
      const ids = await getFilteredLeadIds(folder.id, {
        sortField: sortField || undefined,
        sortDir,
        filterField: filterField || undefined,
        filterValue: filterValue || undefined,
      });
      setFilteredCount(ids.length);
    } finally {
      setIsLoadingCount(false);
    }
  }

  function handleClearFilter() {
    setFilterField("");
    setFilterValue("");
    setFilteredCount(null);
  }

  async function handleGoToReview() {
    setIsLoadingCount(true);
    try {
      const ids = await getFilteredLeadIds(folder.id, {
        sortField: sortField || undefined,
        sortDir,
        filterField: filterField || undefined,
        filterValue: filterValue || undefined,
      });
      setFilteredIds(ids);
      setFilteredCount(ids.length);
      setStep("review");
    } finally {
      setIsLoadingCount(false);
    }
  }

  function handleCreate() {
    if (filteredIds.length === 0 || batchSize <= 0) return;
    setIsCreating(true);
    setCreateError(null);
    startTransition(async () => {
      try {
        await createMultipleBatches({
          folder_id: folder.id,
          name_prefix: namePrefix || folder.name,
          lead_ids: filteredIds,
          batch_size: batchSize,
        });
        onClose();
        router.push("/enrichment");
      } catch (err) {
        console.error("Batch creation failed:", err);
        setCreateError(
          err instanceof Error ? err.message : "Failed to create batches. Please try again."
        );
        setIsCreating(false);
      }
    });
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-(--color-surface-1) rounded-3xl w-full max-w-2xl shadow-2xl border-2 border-(--color-card-border) overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <h3 className="text-xl font-bold text-(--color-fg)">
              Create Enrichment Batches
            </h3>
            <p className="text-sm text-(--color-fg-muted) mt-0.5">
              {folder.name} · {totalCount} total leads
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 px-8 pb-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-(--color-accent) text-(--color-accent-fg)"
                    : done
                    ? "bg-(--color-accent)/10 text-(--color-accent)"
                    : "bg-(--color-surface-2) text-(--color-fg-subtle)"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {s.label}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-8 pb-6">
          {/* Step 1: Filter & Sort */}
          {step === "filter" && (
            <div className="space-y-6">
              {/* Sort */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-(--color-fg) flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-(--color-accent)" />
                  Sort Leads
                </h4>
                <div className="flex gap-3">
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    className="flex-1 h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                  >
                    <option value="">No sorting (default order)</option>
                    {sortableFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                    disabled={!sortField}
                    className="w-36 h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none disabled:opacity-40"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              {/* Filter */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-(--color-fg) flex items-center gap-2">
                  <Filter className="h-4 w-4 text-(--color-accent)" />
                  Filter Leads (Optional)
                </h4>
                <div className="flex gap-3">
                  <select
                    value={filterField}
                    onChange={(e) => {
                      setFilterField(e.target.value);
                      setFilteredCount(null);
                    }}
                    className="flex-1 h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                  >
                    <option value="">No filter (all leads)</option>
                    {sortableFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Contains…"
                    value={filterValue}
                    onChange={(e) => {
                      setFilterValue(e.target.value);
                      setFilteredCount(null);
                    }}
                    disabled={!filterField}
                    className="flex-1"
                  />
                </div>
                {filterField && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handlePreviewCount}
                      disabled={isLoadingCount}
                    >
                      {isLoadingCount ? "Counting…" : "Preview Count"}
                    </Button>
                    <button
                      type="button"
                      onClick={handleClearFilter}
                      className="text-xs text-(--color-fg-muted) hover:text-(--color-fg)"
                    >
                      Clear filter
                    </button>
                    {filteredCount !== null && (
                      <span className="text-sm font-bold text-(--color-accent)">
                        {filteredCount} of {totalCount} leads match
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-2xl bg-(--color-surface-2) p-5">
                <p className="text-sm text-(--color-fg)">
                  <span className="font-bold text-(--color-accent)">{effectiveCount}</span>{" "}
                  leads will be used for batch creation
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Batch sizing */}
          {step === "batch" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-(--color-fg) flex items-center gap-2">
                  <Layers className="h-4 w-4 text-(--color-accent)" />
                  Batch Size
                </h4>
                <p className="text-sm text-(--color-fg-muted)">
                  How many leads per batch?
                </p>
                <Input
                  type="number"
                  min={1}
                  max={effectiveCount}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value)))}
                  className="w-40"
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-(--color-fg)">Batch Name Prefix</h4>
                <Input
                  value={namePrefix}
                  onChange={(e) => setNamePrefix(e.target.value)}
                  placeholder="e.g. Malaysia"
                />
                <p className="text-xs text-(--color-fg-muted)">
                  Batches will be named: &ldquo;{namePrefix || folder.name} - Batch #1&rdquo;,
                  &ldquo;{namePrefix || folder.name} - Batch #2&rdquo;, etc.
                </p>
              </div>

              {/* Preview */}
              <div className="rounded-2xl bg-(--color-surface-2) p-5 space-y-3">
                <h4 className="text-sm font-bold text-(--color-fg)">Preview</h4>
                {batchSize > 0 && effectiveCount > 0 ? (
                  <>
                    <p className="text-sm text-(--color-fg-muted)">
                      This will create{" "}
                      <span className="font-bold text-(--color-accent)">
                        {totalBatches} batch{totalBatches > 1 ? "es" : ""}
                      </span>
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {Array.from({ length: Math.min(totalBatches, 20) }, (_, i) => {
                        const size =
                          i === totalBatches - 1 ? lastBatchSize : batchSize;
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-xl bg-(--color-surface-1) px-4 py-2.5 text-sm border-2 border-(--color-card-border)"
                          >
                            <span className="font-medium text-(--color-fg)">
                              {namePrefix || folder.name} - Batch #{i + 1}
                            </span>
                            <span className="text-(--color-fg-muted)">
                              {size} leads
                            </span>
                          </div>
                        );
                      })}
                      {totalBatches > 20 && (
                        <p className="text-xs text-(--color-fg-subtle) text-center py-2">
                          … and {totalBatches - 20} more batches
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-(--color-fg-subtle)">
                    Enter a valid batch size
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review & Create */}
          {step === "review" && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-(--color-surface-2) p-6 space-y-4">
                <h4 className="text-sm font-bold text-(--color-fg)">Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-(--color-fg-subtle)">Source Folder</p>
                    <p className="font-bold text-(--color-fg)">{folder.name}</p>
                  </div>
                  <div>
                    <p className="text-(--color-fg-subtle)">Total Leads</p>
                    <p className="font-bold text-(--color-fg)">{filteredIds.length}</p>
                  </div>
                  <div>
                    <p className="text-(--color-fg-subtle)">Batch Size</p>
                    <p className="font-bold text-(--color-fg)">{batchSize} per batch</p>
                  </div>
                  <div>
                    <p className="text-(--color-fg-subtle)">Batches to Create</p>
                    <p className="font-bold text-(--color-accent)">{totalBatches}</p>
                  </div>
                  {sortField && (
                    <div>
                      <p className="text-(--color-fg-subtle)">Sorted By</p>
                      <p className="font-bold text-(--color-fg)">
                        {sortableFields.find((f) => f.key === sortField)?.label ?? sortField}{" "}
                        ({sortDir})
                      </p>
                    </div>
                  )}
                  {filterField && (
                    <div>
                      <p className="text-(--color-fg-subtle)">Filtered</p>
                      <p className="font-bold text-(--color-fg)">
                        {sortableFields.find((f) => f.key === filterField)?.label ?? filterField}{" "}
                        contains &ldquo;{filterValue}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {createError && (
                <div className="rounded-2xl bg-(--color-danger)/10 border-2 border-(--color-danger)/20 p-4">
                  <p className="text-sm font-medium text-(--color-danger)">{createError}</p>
                </div>
              )}

              {/* Batch list preview */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Array.from({ length: Math.min(totalBatches, 10) }, (_, i) => {
                  const size =
                    i === totalBatches - 1
                      ? filteredIds.length % batchSize || batchSize
                      : batchSize;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl bg-(--color-surface-2) px-4 py-2.5 text-sm border-2 border-(--color-card-border)"
                    >
                      <span className="font-medium text-(--color-fg)">
                        {namePrefix || folder.name} - Batch #{i + 1}
                      </span>
                      <span className="text-(--color-fg-muted)">
                        {size} leads
                      </span>
                    </div>
                  );
                })}
                {totalBatches > 10 && (
                  <p className="text-xs text-(--color-fg-subtle) text-center py-2">
                    … and {totalBatches - 10} more batches
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-(--color-card-border) bg-(--color-surface-2)/50">
          <div>
            {step !== "filter" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setStep(step === "review" ? "batch" : "filter")
                }
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {step === "filter" && (
              <Button
                size="sm"
                onClick={() => setStep("batch")}
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === "batch" && (
              <Button
                size="sm"
                onClick={handleGoToReview}
                disabled={batchSize <= 0 || isLoadingCount}
              >
                {isLoadingCount ? "Loading…" : "Review"}{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === "review" && (
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating || filteredIds.length === 0}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isCreating
                  ? "Creating…"
                  : `Create ${totalBatches} Batch${totalBatches > 1 ? "es" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
