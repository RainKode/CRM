"use client";

import { useState, useTransition } from "react";
import { Trash2, Undo2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/types";
import {
  emptyTrash,
  getTrashedDeals,
  getTrashedLeads,
  purgeDeal,
  purgeLead,
  restoreDeal,
  restoreLead,
  type TrashedLead,
} from "./actions";

type Tab = "deals" | "leads";

function relative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  return `${days}d ago`;
}

function daysUntilPurge(deletedAt: string | null): number {
  if (!deletedAt) return 30;
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(30 - elapsed));
}

export function TrashView({
  initialDeals,
  initialLeads,
}: {
  initialDeals: Deal[];
  initialLeads: TrashedLead[];
}) {
  const [tab, setTab] = useState<Tab>("deals");
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [leads, setLeads] = useState<TrashedLead[]>(initialLeads);
  const [isPending, startTransition] = useTransition();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refetch() {
    startTransition(async () => {
      const [d, l] = await Promise.all([getTrashedDeals(), getTrashedLeads()]);
      setDeals(d);
      setLeads(l);
    });
  }

  function handleRestoreDeal(id: string) {
    setDeals((prev) => prev.filter((d) => d.id !== id));
    startTransition(async () => {
      try {
        await restoreDeal(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore");
        refetch();
      }
    });
  }

  function handleRestoreLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      try {
        await restoreLead(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore");
        refetch();
      }
    });
  }

  function handlePurgeDeal(id: string) {
    if (!confirm("Permanently delete this deal? This cannot be undone.")) return;
    setDeals((prev) => prev.filter((d) => d.id !== id));
    startTransition(async () => {
      try {
        await purgeDeal(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to purge");
        refetch();
      }
    });
  }

  function handlePurgeLead(id: string) {
    if (!confirm("Permanently delete this lead? This cannot be undone.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      try {
        await purgeLead(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to purge");
        refetch();
      }
    });
  }

  function handleEmptyTrash() {
    setConfirmEmpty(false);
    setDeals([]);
    setLeads([]);
    startTransition(async () => {
      try {
        await emptyTrash();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to empty trash");
        refetch();
      }
    });
  }

  const totalCount = deals.length + leads.length;
  const rows = tab === "deals" ? deals : leads;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex justify-between items-center px-8 md:px-12 h-24 shrink-0">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight text-(--color-fg)">
            Recycle Bin
          </h1>
          <p className="text-sm text-(--color-fg-muted) mt-1">
            Deleted items are kept for 30 days before being permanently removed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmEmpty(true)}
            disabled={totalCount === 0 || isPending}
            className="text-(--color-danger) border-(--color-danger)/30 hover:bg-(--color-danger)/10"
          >
            <Trash2 className="h-4 w-4" /> Empty trash
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-8 md:px-12 border-b border-(--color-border)/15 flex gap-6 shrink-0">
        {(["deals", "leads"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "pb-3 text-sm font-medium capitalize border-b-2 transition-colors flex items-center gap-2",
              tab === t
                ? "text-(--color-fg) border-(--color-accent)"
                : "text-(--color-fg-muted) border-transparent hover:text-(--color-fg)"
            )}
          >
            {t}
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-(--color-surface-3) text-[11px] font-semibold text-(--color-fg-muted)">
              {t === "deals" ? deals.length : leads.length}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-8 md:mx-12 mt-4 flex items-center gap-2 rounded-lg bg-(--color-danger)/10 border border-(--color-danger)/30 px-4 py-2 text-sm text-(--color-danger)">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs underline"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 md:px-12 py-6">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-(--color-surface-2) flex items-center justify-center mb-4">
              <Trash2 className="h-7 w-7 text-(--color-fg-subtle)" />
            </div>
            <p className="text-sm font-medium text-(--color-fg)">
              No deleted {tab}
            </p>
            <p className="text-xs text-(--color-fg-muted) mt-1">
              Deleted {tab} show up here and can be restored for 30 days.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-(--color-grid-header)">
              <tr>
                {[
                  "Name",
                  tab === "deals" ? "Company" : "Folder",
                  "Deleted",
                  "Purges in",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-(--color-grid-line) px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-(--color-fg-subtle)"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === "deals"
                ? deals.map((d) => {
                    const days = daysUntilPurge(d.deleted_at);
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-(--color-grid-line)"
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {d.contact_name}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-fg-muted)">
                          {d.company ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-fg-subtle)">
                          {relative(d.deleted_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={days <= 3 ? "danger" : "neutral"}>
                            {days}d
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestoreDeal(d.id)}
                              disabled={isPending}
                            >
                              <Undo2 className="h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePurgeDeal(d.id)}
                              disabled={isPending}
                              className="text-(--color-danger) hover:bg-(--color-danger)/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : leads.map((l) => {
                    const days = daysUntilPurge(l.deleted_at);
                    return (
                      <tr
                        key={l.id}
                        className="border-b border-(--color-grid-line)"
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {l.name ?? l.email ?? "Unnamed lead"}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-fg-muted)">
                          {l.folder_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-fg-subtle)">
                          {relative(l.deleted_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={days <= 3 ? "danger" : "neutral"}>
                            {days}d
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestoreLead(l.id)}
                              disabled={isPending}
                            >
                              <Undo2 className="h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePurgeLead(l.id)}
                              disabled={isPending}
                              className="text-(--color-danger) hover:bg-(--color-danger)/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        )}
      </div>

      {/* Empty-trash confirmation */}
      {confirmEmpty && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-(--color-surface-1) border border-(--color-border)/30 p-6 shadow-(--shadow-popover)">
            <h3 className="text-lg font-semibold text-(--color-fg) mb-2">
              Empty recycle bin?
            </h3>
            <p className="text-sm text-(--color-fg-muted) mb-5">
              This permanently removes <strong>{totalCount}</strong>{" "}
              {totalCount === 1 ? "item" : "items"}. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmEmpty(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEmptyTrash}
                className="bg-(--color-danger) hover:bg-(--color-danger)/90 text-white border-none"
              >
                <Trash2 className="h-3.5 w-3.5" /> Empty trash
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
