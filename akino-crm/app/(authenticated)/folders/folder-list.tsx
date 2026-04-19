"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  Users,
  Sparkles,
  Workflow,
  GripVertical,
  Lock,
  Minus,
  X,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatCount, relativeTime } from "@/lib/utils";
import type { FolderWithCounts, FieldDefinition, FieldType } from "@/lib/types";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  archiveFolder,
} from "./actions";
import {
  getFieldDefinitions,
  createField,
  deleteField,
  updateField,
} from "./[folderId]/actions";

// ─────────────────────────────────────────────
// Create folder dialog
// ─────────────────────────────────────────────
function CreateFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createFolder(name.trim(), desc.trim() || undefined);
      setName("");
      setDesc("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>
            Name your new lead folder — like creating a new spreadsheet tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <Input
              placeholder="e.g. UK Agencies Q2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Input
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
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
            <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
              {isPending ? "Creating…" : "Create Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Rename dialog
// ─────────────────────────────────────────────
function RenameFolderDialog({
  folder,
  open,
  onOpenChange,
}: {
  folder: FolderWithCounts;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await renameFolder(folder.id, name.trim());
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
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
            <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
              {isPending ? "Saving…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Delete dialog (type name to confirm)
// ─────────────────────────────────────────────
function DeleteFolderDialog({
  folder,
  open,
  onOpenChange,
}: {
  folder: FolderWithCounts;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = confirm === folder.name;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteFolder(folder.id);
        onOpenChange(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Folder</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <strong className="text-(--color-danger)">{folder.name}</strong>{" "}
            and all its leads. Type the folder name to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <Input
              placeholder={folder.name}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoFocus
            />
            {error && (
              <p className="text-sm text-(--color-danger)">{error}</p>
            )}
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
              variant="danger"
              size="sm"
              disabled={!matches || isPending}
            >
              {isPending ? "Deleting…" : "Delete Forever"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Configure Enrichment Fields modal
// ─────────────────────────────────────────────
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
  id?: string;       // existing field id — absent for new unsaved rows
  label: string;
  type: FieldType;
};

function EnrichmentFieldsModal({
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
  const [isLoading, setIsLoading] = useState(true);
  const [existingFields, setExistingFields] = useState<FieldDefinition[]>([]);
  const [customFields, setCustomFields] = useState<DraftField[]>([]);
  const [typeDropdown, setTypeDropdown] = useState<number | null>(null);

  const loadFields = useCallback(async () => {
    setIsLoading(true);
    const fields = await getFieldDefinitions(folderId);
    setExistingFields(fields);
    // Populate custom (enrichment) fields
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
      // Determine which existing enrichment fields were removed
      const existingEnrichment = existingFields.filter((f) => f.is_enrichment);
      const keptIds = new Set(customFields.map((f) => f.id).filter(Boolean));

      for (const ef of existingEnrichment) {
        if (!keptIds.has(ef.id)) {
          await deleteField(ef.id, folderId);
        }
      }

      // Update existing fields that changed
      for (const cf of customFields) {
        if (cf.id) {
          const orig = existingEnrichment.find((f) => f.id === cf.id);
          if (orig && (orig.label !== cf.label || orig.type !== cf.type)) {
            await updateField(cf.id, folderId, { label: cf.label });
          }
        }
      }

      // Create new fields (those without id)
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
      <div className="relative z-10 w-full max-w-[640px] bg-(--color-surface-1) rounded-xl shadow-(--shadow-popover) flex flex-col border border-(--color-card-border)">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold text-(--color-fg) tracking-tight">
              Configure Enrichment Fields
            </h2>
            <p className="text-[15px] text-(--color-fg-muted) mt-2">
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
        <div className="px-8 py-4 flex flex-col gap-8 max-h-[60vh] overflow-y-auto">
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
                      <div className="flex-1 bg-(--color-surface-3) rounded px-3 py-2 border-b-2 border-transparent focus-within:border-(--color-accent) transition-colors">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) =>
                            updateRow(idx, { label: e.target.value })
                          }
                          placeholder="Field Name"
                          className="bg-transparent border-none outline-none text-[15px] text-(--color-fg) w-full p-0 placeholder:text-(--color-fg-subtle)"
                        />
                      </div>
                      {/* Type selector */}
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
                  className="mt-4 flex items-center gap-2 text-(--color-accent) text-[15px] font-medium hover:text-(--color-accent-hover) transition-colors py-2 px-3 rounded-full hover:bg-(--color-accent-muted)"
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
            className="px-6 py-2.5 rounded-full text-[15px] font-medium text-(--color-fg-muted) border border-(--color-card-border) hover:bg-(--color-surface-3) transition-colors"
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

// ─────────────────────────────────────────────
// Context menu for each folder card
// ─────────────────────────────────────────────
function FolderMenu({
  folder,
  onRename,
  onDelete,
  onArchive,
}: {
  folder: FolderWithCounts;
  onRename: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-(--color-fg-subtle) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-(--color-border-strong) bg-(--color-surface-1) p-1 shadow-(--shadow-popover)">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
            >
              <Archive className="h-3.5 w-3.5" />{" "}
              {folder.is_archived ? "Unarchive" : "Archive"}
            </button>
            <div className="my-1 h-px bg-(--color-border)" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-(--color-danger) hover:bg-[rgba(239,68,68,0.1)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main list
// ─────────────────────────────────────────────
export function FolderList({
  initialFolders,
}: {
  initialFolders: FolderWithCounts[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderWithCounts | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<FolderWithCounts | null>(
    null
  );
  const [enrichTarget, setEnrichTarget] = useState<FolderWithCounts | null>(
    null
  );
  const [, startTransition] = useTransition();

  const active = initialFolders.filter((f) => !f.is_archived);
  const archived = initialFolders.filter((f) => f.is_archived);

  function handleArchive(folder: FolderWithCounts) {
    startTransition(() => archiveFolder(folder.id, !folder.is_archived));
  }

  return (
    <>
      {/* Action bar */}
      <div className="mb-8 flex items-center justify-between">
        <p className="text-sm text-(--color-fg-muted)">
          {active.length} batch{active.length !== 1 ? "es" : ""}
          {archived.length > 0 && ` · ${archived.length} archived`}
        </p>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="rounded-full"
        >
          <Plus className="h-4 w-4" /> New Batch
        </Button>
      </div>

      {/* Empty state */}
      {active.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-(--color-surface-4)">
            <FolderOpen className="h-6 w-6 text-(--color-fg-subtle)" />
          </div>
          <p className="text-sm text-(--color-fg-muted)">
            No batches yet. Create one to start importing leads.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="rounded-full">
            <Plus className="h-4 w-4" /> Create your first batch
          </Button>
        </div>
      )}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {active.map((folder) => {
          const pct =
            folder.lead_count > 0
              ? Math.round(
                  (folder.enriched_count / folder.lead_count) * 100
                )
              : 0;
          const isComplete = pct === 100 && folder.lead_count > 0;

          return (
            <div
              key={folder.id}
              className="bg-(--color-surface-1) rounded-[2rem] p-8 flex flex-col gap-6 group hover:-translate-y-1 transition-all duration-300 relative overflow-hidden shadow-(--shadow-card-3d) border-2 border-(--color-card-border) hover:shadow-(--shadow-card-3d-hover)"
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent)/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Top row: icon + menu */}
              <div className="flex justify-between items-start relative z-10">
                <div className="w-12 h-12 rounded-full bg-(--color-surface-4) flex items-center justify-center">
                  <FolderOpen className="h-5 w-5 text-(--color-accent)" />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <FolderMenu
                    folder={folder}
                    onRename={() => setRenameTarget(folder)}
                    onDelete={() => setDeleteTarget(folder)}
                    onArchive={() => handleArchive(folder)}
                  />
                </div>
              </div>

              {/* Title */}
              <div className="relative z-10">
                <h3 className="text-[21px] font-bold text-(--color-fg) mb-1">
                  {folder.name}
                </h3>
                <p className="text-sm text-(--color-fg-muted) font-medium">
                  Updated {relativeTime(folder.updated_at)}
                </p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="bg-(--color-surface-2) p-4 rounded-xl">
                  <p className="text-xs text-(--color-fg-muted) uppercase tracking-wider font-semibold mb-1">
                    Total
                  </p>
                  <p className="text-xl font-bold text-(--color-fg)">
                    {formatCount(folder.lead_count)}
                  </p>
                </div>
                <div className="bg-(--color-surface-2) p-4 rounded-xl">
                  <p className="text-xs text-(--color-fg-muted) uppercase tracking-wider font-semibold mb-1">
                    Enriched
                  </p>
                  <p className="text-xl font-bold text-(--color-fg)">
                    {formatCount(folder.enriched_count)}
                  </p>
                </div>
              </div>

              {/* Progress bar + Actions */}
              <div className="relative z-10 mt-auto pt-4 flex justify-between items-center">
                <div className="flex-1 mr-6">
                  <div className="h-1 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isComplete
                          ? "bg-(--color-success)"
                          : "bg-(--color-accent)"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEnrichTarget(folder);
                    }}
                    className="flex items-center gap-1.5 text-(--color-accent-text) font-semibold hover:text-(--color-fg) transition-colors text-sm"
                    title="Configure Enrichment Fields"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden lg:inline">Fields</span>
                  </button>
                  <Link
                    href={`/folders/${folder.id}`}
                    className="text-(--color-accent-text) font-semibold hover:text-(--color-fg) transition-colors text-sm uppercase tracking-wide"
                  >
                    Open List
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived section */}
      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-(--color-fg-subtle) hover:text-(--color-fg-muted)">
            {archived.length} archived batch{archived.length !== 1 ? "es" : ""}
          </summary>
          <div className="mt-3 grid gap-6 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((folder) => (
              <div
                key={folder.id}
                className="bg-(--color-surface-1) rounded-[2rem] p-6 flex items-center justify-between shadow-(--shadow-card-3d) border-2 border-(--color-card-border)"
              >
                <div className="flex items-center gap-3">
                  <Archive className="h-5 w-5 text-(--color-fg-subtle)" />
                  <span className="text-sm font-medium text-(--color-fg)">
                    {folder.name}
                  </span>
                </div>
                <FolderMenu
                  folder={folder}
                  onRename={() => setRenameTarget(folder)}
                  onDelete={() => setDeleteTarget(folder)}
                  onArchive={() => handleArchive(folder)}
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Dialogs */}
      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} />
      {renameTarget && (
        <RenameFolderDialog
          folder={renameTarget}
          open
          onOpenChange={(v) => !v && setRenameTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteFolderDialog
          folder={deleteTarget}
          open
          onOpenChange={(v) => !v && setDeleteTarget(null)}
        />
      )}
      {enrichTarget && (
        <EnrichmentFieldsModal
          folderId={enrichTarget.id}
          folderName={enrichTarget.name}
          open
          onOpenChange={(v) => !v && setEnrichTarget(null)}
        />
      )}
    </>
  );
}
