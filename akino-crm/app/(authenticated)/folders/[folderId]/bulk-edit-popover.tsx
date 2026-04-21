"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FieldDefinition } from "@/lib/types";
import { bulkUpdateLeads } from "./actions";

/**
 * Bulk-edit a single field across the currently selected leads.
 * Opens as a small popover from the bottom toolbar.
 */
export function BulkEditPopover({
  open,
  onClose,
  folderId,
  selectedIds,
  selectedCount,
  fields,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string;
  selectedIds: string[];
  selectedCount: number;
  fields: FieldDefinition[];
  onDone: () => void;
}) {
  const [fieldKey, setFieldKey] = useState<string>("status");
  const [value, setValue] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editableFields: { key: string; label: string; kind: "builtin" | "custom" }[] = [
    { key: "status", label: "Status", kind: "builtin" },
    { key: "notes", label: "Notes", kind: "builtin" },
    { key: "company", label: "Company", kind: "builtin" },
    ...fields
      .filter((f) => !f.is_enrichment)
      .map((f) => ({ key: f.key, label: f.label, kind: "custom" as const })),
  ];

  function handleApply() {
    if (selectedIds.length === 0) {
      setError("No leads selected.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await bulkUpdateLeads({
          folderId,
          leadIds: selectedIds,
          fieldKey,
          value: value === "" ? null : value,
        });
        onDone();
        onClose();
        setValue("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="absolute bottom-16 left-6 z-40 w-80 rounded-2xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-popover) overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-card-border)">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-(--color-accent)" />
          <span className="text-sm font-bold text-(--color-fg)">
            Edit {selectedCount} {selectedCount === 1 ? "lead" : "leads"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-(--color-fg-subtle) hover:text-(--color-fg)"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle) block mb-1.5">
            Field
          </label>
          <select
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            className="w-full rounded-lg bg-(--color-surface-2) border border-(--color-card-border) px-3 py-2 text-sm text-(--color-fg) outline-none focus:border-(--color-accent)"
          >
            {editableFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle) block mb-1.5">
            Value{" "}
            <span className="font-normal text-(--color-fg-subtle) normal-case">
              (leave empty to clear)
            </span>
          </label>
          {fieldKey === "status" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg bg-(--color-surface-2) border border-(--color-card-border) px-3 py-2 text-sm text-(--color-fg) outline-none focus:border-(--color-accent)"
            >
              <option value="">— (clear)</option>
              <option value="new">New</option>
              <option value="enriching">Enriching</option>
              <option value="enriched">Enriched</option>
              <option value="disqualified">Disqualified</option>
            </select>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="New value"
              className="w-full rounded-lg bg-(--color-surface-2) border border-(--color-card-border) px-3 py-2 text-sm text-(--color-fg) outline-none focus:border-(--color-accent) placeholder:text-(--color-fg-subtle)"
            />
          )}
        </div>

        {error && (
          <div className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={isPending || selectedIds.length === 0}
            className={cn(isPending && "opacity-70")}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…
              </>
            ) : (
              `Apply to ${selectedCount}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
