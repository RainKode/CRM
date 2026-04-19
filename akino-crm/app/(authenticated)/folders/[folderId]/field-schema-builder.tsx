"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FieldDefinition, FieldType } from "@/lib/types";
import { createField, updateField, deleteField } from "./actions";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "multiselect", label: "Multi-select" },
];

function AddFieldDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isEnrichment, setIsEnrichment] = useState(false);
  const [desc, setDesc] = useState("");
  const [isPending, startTransition] = useTransition();

  const needsOptions = type === "dropdown" || type === "multiselect";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    const key = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    startTransition(async () => {
      await createField(folderId, {
        key,
        label: label.trim(),
        type,
        options: needsOptions
          ? options
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
        is_required: isRequired,
        is_enrichment: isEnrichment,
        description: desc.trim() || undefined,
      });
      setLabel("");
      setType("text");
      setOptions("");
      setIsRequired(false);
      setIsEnrichment(false);
      setDesc("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Column</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <Input
              placeholder="Column name, e.g. Industry"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none transition-all"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </select>
            {needsOptions && (
              <Input
                placeholder="Options (comma separated): Agency, SaaS, E-commerce"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            )}
            <Input
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-(--color-fg-muted)">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="accent-(--color-accent)"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-(--color-fg-muted)">
                <input
                  type="checkbox"
                  checked={isEnrichment}
                  onChange={(e) => setIsEnrichment(e.target.checked)}
                  className="accent-(--color-accent)"
                />
                Enrichment field
              </label>
            </div>
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
              disabled={!label.trim() || isPending}
            >
              {isPending ? "Adding…" : "Add Column"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FieldSchemaBuilder({
  folderId,
  fields,
}: {
  folderId: string;
  fields: FieldDefinition[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [, startTransition] = useTransition();

  function toggleHidden(field: FieldDefinition) {
    startTransition(() =>
      updateField(field.id, folderId, { is_hidden: !field.is_hidden })
    );
  }

  function handleDelete(field: FieldDefinition) {
    if (
      !window.confirm(
        `Delete column "${field.label}"? This removes all data in this column from every lead.`
      )
    )
      return;
    startTransition(() => deleteField(field.id, folderId));
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-(--color-fg)">Column Schema</h2>
          <p className="text-sm text-(--color-fg-muted)">
            Define what data fields exist in this folder
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Column
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-(--color-surface-1) py-20 text-center shadow-(--shadow-card) border border-(--color-card-border)">
          <p className="text-sm text-(--color-fg-subtle)">
            No columns defined yet. Add columns to define your lead data
            structure.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add your first column
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[24px_1fr_100px_80px_60px_60px_40px] items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
            <span />
            <span>Label</span>
            <span>Type</span>
            <span>Key</span>
            <span className="text-center">Vis</span>
            <span className="text-center">Enr</span>
            <span />
          </div>

          {/* Rows */}
          {fields.map((field) => (
            <div
              key={field.id}
              className={cn(
                "grid grid-cols-[24px_1fr_100px_80px_60px_60px_40px] items-center gap-2 rounded-xl px-4 py-3 transition-colors hover:bg-(--color-surface-1)",
                field.is_hidden && "opacity-50"
              )}
            >
              <GripVertical className="h-3.5 w-3.5 cursor-grab text-(--color-fg-disabled)" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{field.label}</span>
                {field.is_required && (
                  <Badge tone="warn">Required</Badge>
                )}
              </div>
              <Badge tone="neutral">{field.type}</Badge>
              <span className="truncate text-xs text-(--color-fg-subtle) font-mono">
                {field.key}
              </span>
              <button
                type="button"
                onClick={() => toggleHidden(field)}
                className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-(--color-fg-subtle) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
                title={field.is_hidden ? "Show" : "Hide"}
              >
                {field.is_hidden ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
              <div className="mx-auto">
                {field.is_enrichment && (
                  <Sparkles className="h-3.5 w-3.5 text-(--color-accent)" />
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(field)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--color-fg-subtle) hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AddFieldDialog
        folderId={folderId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}
