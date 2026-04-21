"use client";

import { useEffect, useState, useTransition } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportHistory } from "@/lib/types";
import { getUndoableImport, undoImport } from "./actions";

/**
 * Header button that shows up for 24 hours after the most recent successful
 * CSV import and lets the user delete every lead from that batch with one
 * click. Silently renders nothing if there is nothing to undo.
 */
export function UndoImportButton({ folderId }: { folderId: string }) {
  const [row, setRow] = useState<ImportHistory | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load on mount + poll loosely so the button disappears when the window
  // elapses without needing a hard refresh.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await getUndoableImport(folderId);
        if (!cancelled) setRow(r);
      } catch {
        if (!cancelled) setRow(null);
      }
    };
    load();
    const i = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [folderId]);

  if (!row) return null;

  const newRows = row.new_rows ?? 0;
  const handleUndo = () => {
    startTransition(async () => {
      try {
        await undoImport({ batchId: row.id, folderId });
        setRow(null);
        setConfirming(false);
        // The server action revalidates the folder path, but we still need a
        // full refresh to rehydrate the lead table from the page loader.
        window.location.reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Undo failed");
        setConfirming(false);
      }
    });
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-(--color-surface-2) px-3 py-1">
        <span className="text-xs text-(--color-fg-muted)">
          Delete {newRows} imported {newRows === 1 ? "lead" : "leads"}?
        </span>
        <Button
          size="sm"
          variant="danger"
          onClick={handleUndo}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Undo"
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => setConfirming(true)}
      title={`Undo last import (${row.filename}) — ${newRows} new leads`}
    >
      <Undo2 className="h-4 w-4" />
      Undo last import
    </Button>
  );
}
