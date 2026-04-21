"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Lock,
  MoreHorizontal,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createSavedView,
  deleteSavedView,
  updateSavedView,
  type SavedView,
  type SavedViewScope,
} from "./actions";

// Picker component for switching between saved views on a page.
// Caller provides: current filter state + the ability to apply a filter map.
export function SavedViewPicker({
  scope,
  scopeRef,
  initialViews,
  activeViewId,
  currentFilters,
  onApply,
  currentUserId,
}: {
  scope: SavedViewScope;
  scopeRef: string | null;
  initialViews: SavedView[];
  activeViewId: string | null;
  currentFilters: Record<string, unknown>;
  onApply: (view: SavedView | null) => void;
  currentUserId: string | null;
}) {
  const [views, setViews] = useState<SavedView[]>(initialViews);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShared, setNewShared] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const v = await createSavedView({
          scope,
          scope_ref: scopeRef,
          name,
          filters: currentFilters,
          is_shared: newShared,
        });
        setViews((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
        setNewName("");
        setNewShared(false);
        setSaving(false);
        setOpen(false);
        onApply(v);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function handleDelete(v: SavedView) {
    if (!confirm(`Delete "${v.name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteSavedView(v.id);
        setViews((prev) => prev.filter((x) => x.id !== v.id));
        if (activeViewId === v.id) onApply(null);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function handleToggleShared(v: SavedView) {
    startTransition(async () => {
      try {
        await updateSavedView(v.id, { is_shared: !v.is_shared });
        setViews((prev) =>
          prev.map((x) =>
            x.id === v.id ? { ...x, is_shared: !v.is_shared } : x
          )
        );
      } catch (e) {
        console.error(e);
      }
    });
  }

  function handleOverwrite(v: SavedView) {
    if (!confirm(`Overwrite "${v.name}" with current filters?`)) return;
    startTransition(async () => {
      try {
        await updateSavedView(v.id, { filters: currentFilters });
        setViews((prev) =>
          prev.map((x) => (x.id === v.id ? { ...x, filters: currentFilters } : x))
        );
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-colors",
          activeView
            ? "bg-(--color-accent)/10 border-(--color-accent)/40 text-(--color-accent)"
            : "bg-(--color-surface-2) border-transparent text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-surface-3)"
        )}
      >
        <Bookmark className="h-3.5 w-3.5" />
        <span className="truncate max-w-40">
          {activeView ? activeView.name : "Views"}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-popover) z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-(--color-surface-4) flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
              Saved views
            </span>
            {!saving && (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-(--color-accent) hover:underline"
              >
                <BookmarkPlus className="h-3 w-3" />
                Save current
              </button>
            )}
          </div>

          {/* Save form */}
          {saving && (
            <div className="p-3 border-b border-(--color-surface-4) space-y-2">
              <input
                type="text"
                autoFocus
                placeholder="View name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setSaving(false);
                }}
                className="w-full rounded-lg bg-(--color-surface-2) px-3 py-1.5 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-(--color-fg-muted) cursor-pointer">
                <input
                  type="checkbox"
                  checked={newShared}
                  onChange={(e) => setNewShared(e.target.checked)}
                  className="accent-(--color-accent)"
                />
                Share with team
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSaving(false)}
                  className="px-2.5 py-1 rounded-lg text-xs text-(--color-fg-muted) hover:bg-(--color-surface-3)"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || isPending}
                  className="px-2.5 py-1 rounded-lg text-xs bg-(--color-accent) text-(--color-accent-fg) font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* View list */}
          <div className="max-h-80 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onApply(null);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-(--color-surface-3) text-left",
                !activeView ? "text-(--color-fg)" : "text-(--color-fg-muted)"
              )}
            >
              <span>Default (no filter)</span>
              {!activeView && <Check className="h-3.5 w-3.5 text-(--color-accent)" />}
            </button>

            {views.length === 0 && !saving && (
              <p className="px-3 py-3 text-xs text-(--color-fg-muted) text-center">
                No saved views yet. Apply filters, then click Save current.
              </p>
            )}

            {views.map((v) => {
              const isOwner = v.owner_id === currentUserId;
              const isActive = v.id === activeViewId;
              return (
                <div
                  key={v.id}
                  className={cn(
                    "group flex items-center gap-1 px-3 py-1.5 hover:bg-(--color-surface-3)",
                    isActive && "bg-(--color-accent)/5"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApply(v);
                      setOpen(false);
                    }}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  >
                    {v.is_shared ? (
                      <Users className="h-3 w-3 text-(--color-fg-muted) flex-none" />
                    ) : (
                      <Lock className="h-3 w-3 text-(--color-fg-muted) flex-none" />
                    )}
                    <span className="truncate text-sm text-(--color-fg)">
                      {v.name}
                    </span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 text-(--color-accent) flex-none ml-auto" />
                    )}
                  </button>

                  {isOwner && (
                    <ViewRowMenu
                      onOverwrite={() => handleOverwrite(v)}
                      onToggleShared={() => handleToggleShared(v)}
                      isShared={v.is_shared}
                      onDelete={() => handleDelete(v)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ViewRowMenu({
  onOverwrite,
  onToggleShared,
  onDelete,
  isShared,
}: {
  onOverwrite: () => void;
  onToggleShared: () => void;
  onDelete: () => void;
  isShared: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md hover:bg-(--color-surface-4) flex items-center justify-center text-(--color-fg-muted)"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-popover) py-1 z-50">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOverwrite();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-(--color-fg) hover:bg-(--color-surface-3)"
          >
            <BookmarkPlus className="h-3 w-3" />
            Overwrite with current
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleShared();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-(--color-fg) hover:bg-(--color-surface-3)"
          >
            <Share2 className="h-3 w-3" />
            {isShared ? "Make private" : "Share with team"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-(--color-danger) hover:bg-(--color-danger)/10"
          >
            <Trash2 className="h-3 w-3" />
            Delete view
          </button>
        </div>
      )}
    </div>
  );
}
