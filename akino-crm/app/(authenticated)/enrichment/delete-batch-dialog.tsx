"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deleteBatch } from "./actions";
import { BATCH_DELETE_PHRASE } from "./constants";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batch: {
    id: string;
    name: string;
    total: number;
    completed: number;
  };
};

/**
 * Triple-gate delete dialog:
 *   Gate 1: acknowledge "I understand N leads will be affected"
 *   Gate 2: acknowledge "I understand this is irreversible"
 *   Gate 3: type the exact batch name + "DELETE FOREVER"
 *
 * The Delete button stays disabled until every gate is satisfied.
 * The server re-validates each gate — never trust client state.
 */
export function DeleteBatchDialog({ open, onOpenChange, batch }: Props) {
  const router = useRouter();
  const [ackLeads, setAckLeads] = useState(false);
  const [ackIrreversible, setAckIrreversible] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameMatches = typedName.trim() === batch.name;
  const phraseMatches = typedPhrase.trim() === BATCH_DELETE_PHRASE;
  const allGatesPassed =
    ackLeads && ackIrreversible && nameMatches && phraseMatches;

  function reset() {
    setAckLeads(false);
    setAckIrreversible(false);
    setTypedName("");
    setTypedPhrase("");
    setError(null);
  }

  function handleClose() {
    if (isPending) return;
    reset();
    onOpenChange(false);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteBatch({
          batchId: batch.id,
          confirmName: typedName,
          confirmPhrase: typedPhrase,
          acknowledgements: {
            understandsLeadsAffected: ackLeads,
            understandsIrreversible: ackIrreversible,
          },
        });
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete batch.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <div className="rounded-2xl bg-(--color-surface-1) border-2 border-(--color-danger)/30  overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-(--color-border)/40 bg-(--color-danger)/5">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-full bg-(--color-danger)/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-(--color-danger)" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-(--color-fg)">
                Delete enrichment batch
              </h3>
              <p className="text-xs text-(--color-fg-muted) mt-0.5">
                This cannot be undone. Three confirmations required.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="h-8 w-8 rounded-full hover:bg-(--color-surface-3) flex items-center justify-center text-(--color-fg-subtle) transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Batch summary */}
          <div className="rounded-xl bg-(--color-surface-2) border border-(--color-border) p-4">
            <div className="text-[11px] uppercase tracking-wider text-(--color-fg-subtle) mb-1">
              Batch to delete
            </div>
            <div className="font-semibold text-(--color-fg) wrap-break-word">
              {batch.name}
            </div>
            <div className="text-xs text-(--color-fg-muted) mt-1">
              {batch.total} leads · {batch.completed} enriched
            </div>
          </div>

          {/* Gate 1 + 2: acknowledgements */}
          <div className="space-y-3">
            <label className="flex gap-3 items-start cursor-pointer">
              <input
                type="checkbox"
                checked={ackLeads}
                onChange={(e) => setAckLeads(e.target.checked)}
                disabled={isPending}
                className="mt-1 h-4 w-4 accent-(--color-danger) shrink-0"
              />
              <span className="text-sm text-(--color-fg-muted) leading-relaxed">
                I understand that <strong className="text-(--color-fg)">{batch.total} lead{batch.total === 1 ? "" : "s"}</strong>{" "}
                will lose their batch membership and the enrichment progress on
                this batch will be lost.
              </span>
            </label>
            <label className="flex gap-3 items-start cursor-pointer">
              <input
                type="checkbox"
                checked={ackIrreversible}
                onChange={(e) => setAckIrreversible(e.target.checked)}
                disabled={isPending}
                className="mt-1 h-4 w-4 accent-(--color-danger) shrink-0"
              />
              <span className="text-sm text-(--color-fg-muted) leading-relaxed">
                I understand this action is{" "}
                <strong className="text-(--color-fg)">permanent and cannot be undone</strong>.
              </span>
            </label>
          </div>

          {/* Gate 3a: type batch name */}
          <div>
            <label className="block text-xs font-medium text-(--color-fg-muted) mb-1.5">
              Type the batch name to confirm
            </label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              disabled={isPending}
              placeholder={batch.name}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "w-full rounded-lg bg-(--color-surface-2) border px-3 py-2 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:ring-2 transition-colors",
                nameMatches
                  ? "border-(--color-success) focus:ring-(--color-success)/30"
                  : typedName.length > 0
                  ? "border-(--color-danger) focus:ring-(--color-danger)/30"
                  : "border-(--color-border) focus:ring-(--color-blue)/30"
              )}
            />
          </div>

          {/* Gate 3b: type phrase */}
          <div>
            <label className="block text-xs font-medium text-(--color-fg-muted) mb-1.5">
              Type{" "}
              <code className="px-1.5 py-0.5 rounded bg-(--color-surface-3) text-(--color-danger) font-mono text-[11px]">
                {BATCH_DELETE_PHRASE}
              </code>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              disabled={isPending}
              placeholder={BATCH_DELETE_PHRASE}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "w-full rounded-lg bg-(--color-surface-2) border px-3 py-2 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:ring-2 transition-colors font-mono",
                phraseMatches
                  ? "border-(--color-success) focus:ring-(--color-success)/30"
                  : typedPhrase.length > 0
                  ? "border-(--color-danger) focus:ring-(--color-danger)/30"
                  : "border-(--color-border) focus:ring-(--color-blue)/30"
              )}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-(--color-danger)/10 border border-(--color-danger)/30 px-3 py-2 text-xs text-(--color-danger)">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-(--color-surface-2) border-t border-(--color-border)/40">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="px-5 py-2 rounded-full text-sm font-medium text-(--color-fg-muted) border border-(--color-border)/40 hover:bg-(--color-surface-3) transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!allGatesPassed || isPending}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-semibold text-white transition-all inline-flex items-center gap-2",
              allGatesPassed && !isPending
                ? "bg-(--color-danger) hover:brightness-110 active:translate-y-0"
                : "bg-(--color-danger)/40 cursor-not-allowed"
            )}
          >
            <Trash2 className="h-4 w-4" />
            {isPending ? "Deleting…" : "Delete batch permanently"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
