"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Sparkles,
  Download,
  ClipboardPaste,
  X,
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
import { createField, bulkCreateFields, updateField, deleteField } from "./actions";

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

// ─── Bulk Add Dialog ──────────────────────────────────────────────────
interface BulkEntry {
  label: string;
  type: FieldType;
}

function BulkAddDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pasteValue, setPasteValue] = useState("");
  const [entries, setEntries] = useState<BulkEntry[]>([]);
  const [isPending, startTransition] = useTransition();
  const [defaultType, setDefaultType] = useState<FieldType>("text");

  // Parse pasted text: split by tabs (horizontal) or newlines (vertical)
  function handleParse() {
    const raw = pasteValue.trim();
    if (!raw) return;

    // Detect: if tabs exist treat as horizontal, otherwise newlines
    let names: string[];
    if (raw.includes("\t")) {
      names = raw.split("\t");
    } else {
      names = raw.split(/\r?\n/);
    }

    const parsed = names
      .map((n) => n.trim())
      .filter(Boolean)
      .map((label) => ({ label, type: defaultType }));

    if (parsed.length > 0) setEntries(parsed);
  }

  // Handle paste event directly on the textarea
  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain").trim();
    if (!text) return;

    let names: string[];
    if (text.includes("\t")) {
      names = text.split("\t");
    } else {
      names = text.split(/\r?\n/);
    }

    const parsed = names
      .map((n) => n.trim())
      .filter(Boolean)
      .map((label) => ({ label, type: defaultType }));

    if (parsed.length > 0) {
      e.preventDefault();
      setPasteValue(text);
      setEntries(parsed);
    }
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEntryType(idx: number, type: FieldType) {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, type } : e))
    );
  }

  function setAllTypes(type: FieldType) {
    setDefaultType(type);
    setEntries((prev) => prev.map((e) => ({ ...e, type })));
  }

  function handleSubmit() {
    if (entries.length === 0) return;

    startTransition(async () => {
      try {
        const fields = entries.map((entry) => ({
          key: entry.label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, ""),
          label: entry.label.trim(),
          type: entry.type,
        }));
        await bulkCreateFields(folderId, fields);
        setPasteValue("");
        setEntries([]);
        onOpenChange(false);
      } catch (err) {
        console.error("Bulk add failed:", err);
        alert(err instanceof Error ? err.message : "Failed to add columns. Some may already exist.");
      }
    });
  }

  function handleClose() {
    setPasteValue("");
    setEntries([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Add Columns</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {entries.length === 0 ? (
            <>
              <p className="text-sm text-(--color-fg-muted)">
                Paste column names from Excel or Google Sheets. Works with rows (vertical) or columns (horizontal).
              </p>
              <div className="flex items-center gap-3">
                <label className="text-sm text-(--color-fg-muted) shrink-0">Default type:</label>
                <select
                  value={defaultType}
                  onChange={(e) => setDefaultType(e.target.value as FieldType)}
                  className="h-9 flex-1 rounded-xl border-0 bg-(--color-surface-2) px-3 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                onPaste={handlePaste}
                placeholder={"Paste here — e.g.:\nCompany Name\nEmail\nPhone Number\nIndustry\nRevenue"}
                rows={6}
                className="w-full rounded-xl border-0 bg-(--color-surface-2) px-4 py-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) focus:outline-none resize-none"
                autoFocus
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleParse}
                disabled={!pasteValue.trim()}
                className="w-full"
              >
                <ClipboardPaste className="h-4 w-4" /> Parse Column Names
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-(--color-fg-muted)">
                  {entries.length} columns detected — set the type for each
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-(--color-fg-subtle)">Set all:</label>
                  <select
                    value={defaultType}
                    onChange={(e) => setAllTypes(e.target.value as FieldType)}
                    className="h-8 rounded-lg border-0 bg-(--color-surface-2) px-2 text-xs text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="max-h-72 overflow-auto space-y-1.5 pr-1">
                {entries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl bg-(--color-surface-1) px-4 py-2.5 border-2 border-(--color-card-border)"
                  >
                    <span className="flex-1 text-sm font-medium truncate">
                      {entry.label}
                    </span>
                    <select
                      value={entry.type}
                      onChange={(e) =>
                        updateEntryType(i, e.target.value as FieldType)
                      }
                      className="h-8 rounded-lg border-0 bg-(--color-surface-2) px-2 text-xs text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {ft.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-(--color-fg-subtle) hover:bg-(--color-danger)/10 hover:text-(--color-danger) transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {entries.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEntries([])}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
          >
            Cancel
          </Button>
          {entries.length > 0 && (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isPending || entries.length === 0}
            >
              {isPending
                ? "Adding…"
                : `Add ${entries.length} Column${entries.length > 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleDownloadTemplate() {
    if (fields.length === 0) return;
    const headers = fields.map((f) => f.label).join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleHidden(field: FieldDefinition) {
    startTransition(() =>
      updateField(field.id, folderId, { is_hidden: !field.is_hidden })
    );
  }

  function toggleEnrichment(field: FieldDefinition) {
    startTransition(() =>
      updateField(field.id, folderId, { is_enrichment: !field.is_enrichment })
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
        <div className="flex items-center gap-2">
          {fields.length > 0 && (
            <Button size="sm" variant="secondary" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4" /> Download Template
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
            <ClipboardPaste className="h-4 w-4" /> Bulk Add
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Column
          </Button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-(--color-surface-1) py-20 text-center shadow-(--shadow-card-3d) border-2 border-(--color-card-border)">
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
                <button
                  type="button"
                  onClick={() => toggleEnrichment(field)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    field.is_enrichment
                      ? "bg-(--color-accent)/10 text-(--color-accent) hover:bg-(--color-accent)/20"
                      : "text-(--color-fg-disabled) hover:bg-(--color-surface-3) hover:text-(--color-fg-subtle)"
                  )}
                  title={field.is_enrichment ? "Remove from enrichment" : "Mark as enrichment field"}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(field)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-(--color-fg-subtle) hover:bg-(--color-danger)/10 hover:text-(--color-danger) transition-colors"
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
      <BulkAddDialog
        folderId={folderId}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />
    </div>
  );
}
