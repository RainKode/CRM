"use client";

import { useEffect, useState, useTransition } from "react";
import { XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LossReason } from "@/lib/types";

/**
 * Dialog that blocks a deal from entering the Lost stage until the user
 * picks a loss reason. Used by the pipeline kanban drag handler, the
 * bulk-move action and the DealDetail stage dropdown.
 */
export function LossReasonDialog({
  open,
  dealName,
  dealCount,
  lossReasons,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  dealName?: string;
  dealCount?: number;
  lossReasons: LossReason[];
  onCancel: () => void;
  onConfirm: (lossReasonId: string) => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedId("");
      setError(null);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function handleConfirm() {
    if (!selectedId) {
      setError("Select a reason to continue.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm(selectedId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not mark as lost");
      }
    });
  }

  const headline =
    dealCount && dealCount > 1
      ? `Mark ${dealCount} deals as Lost`
      : dealName
        ? `Mark "${dealName}" as Lost`
        : "Mark deal as Lost";

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl bg-(--color-surface-1) border-2 border-(--color-danger)/30 shadow-(--shadow-popover) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-(--color-card-border)">
          <div className="h-10 w-10 rounded-full bg-(--color-danger)/15 flex items-center justify-center shrink-0">
            <XCircle className="h-5 w-5 text-(--color-danger)" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-(--color-fg)">{headline}</div>
            <div className="text-xs text-(--color-fg-muted) mt-0.5">
              A loss reason is required to close the deal.
            </div>
          </div>
        </div>

        {/* Reasons list */}
        <div className="p-5 space-y-3">
          {lossReasons.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-(--color-warn)/10 text-(--color-warn) px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                No loss reasons configured yet. Add some in Settings before
                marking deals as lost.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1">
              {lossReasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-sm border-2 transition-colors",
                    selectedId === r.id
                      ? "border-(--color-danger) bg-(--color-danger)/10 text-(--color-fg) font-medium"
                      : "border-(--color-card-border) bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="text-xs text-(--color-danger) bg-(--color-danger)/10 rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-(--color-card-border) bg-(--color-surface-2)">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || !selectedId || lossReasons.length === 0}
            className={cn(
              "bg-(--color-danger) hover:bg-(--color-danger)/90 text-white",
              isPending && "opacity-70"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Marking…
              </>
            ) : (
              "Confirm loss"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
