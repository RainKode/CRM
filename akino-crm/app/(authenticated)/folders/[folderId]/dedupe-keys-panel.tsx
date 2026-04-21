"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DedupeKey } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { updateFolderDedupeKeys } from "./actions";

const OPTIONS: { key: DedupeKey; label: string; hint: string }[] = [
  {
    key: "email",
    label: "Email",
    hint: "Case-insensitive exact match on email address",
  },
  {
    key: "phone",
    label: "Phone",
    hint: "Digits-only match — ignores spaces, dashes, and country prefixes",
  },
  {
    key: "name_company",
    label: "Name + Company",
    hint: "Case-insensitive match on both name and company together",
  },
];

/**
 * Folder-scoped settings for how the CSV importer detects duplicates.
 * Rows are treated as duplicates if any enabled key matches. At least one
 * key must stay selected.
 */
export function DedupeKeysPanel({
  folderId,
  initial,
}: {
  folderId: string;
  initial: DedupeKey[];
}) {
  const [selected, setSelected] = useState<DedupeKey[]>(
    initial.length > 0 ? initial : ["email"]
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    selected.length !== initial.length ||
    selected.some((k) => !initial.includes(k));

  function toggle(key: DedupeKey) {
    setSaved(false);
    setSelected((prev) => {
      const has = prev.includes(key);
      if (has) {
        // Don't allow emptying the list.
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateFolderDedupeKeys(folderId, selected);
        setSaved(true);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="mb-6 rounded-2xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-card-3d) p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-(--color-surface-3)">
            <ShieldCheck className="h-4 w-4 text-(--color-accent)" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-(--color-fg)">
              Dedupe on import
            </h3>
            <p className="text-xs text-(--color-fg-muted)">
              Which lead fields should count as duplicates when importing CSVs.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && !dirty && (
            <span className="text-xs text-(--color-success) font-medium">
              Saved
            </span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              className={cn(
                "rounded-xl border-2 px-4 py-3 text-left transition-colors",
                active
                  ? "border-(--color-accent) bg-(--color-accent)/10"
                  : "border-(--color-card-border) bg-(--color-surface-2) hover:bg-(--color-surface-3)"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-(--color-fg)">
                  {opt.label}
                </span>
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border-2",
                    active
                      ? "border-(--color-accent) bg-(--color-accent)"
                      : "border-(--color-card-border)"
                  )}
                />
              </div>
              <p className="mt-1 text-[11px] text-(--color-fg-muted) leading-snug">
                {opt.hint}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
