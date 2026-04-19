"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  SkipForward,
  Flag,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Batch, BatchLead, Lead, FieldDefinition } from "@/lib/types";
import {
  completeBatchLead,
  skipBatchLead,
  flagBatchLead,
  updateLeadRating,
} from "../actions";

type BLWithLead = BatchLead & { lead: Lead };

export function EnrichmentQueue({
  batch,
  batchLeads,
  enrichmentFields,
}: {
  batch: Batch;
  batchLeads: BLWithLead[];
  enrichmentFields: FieldDefinition[];
}) {
  const [currentIdx, setCurrentIdx] = useState(() => {
    // Start at first incomplete lead
    const idx = batchLeads.findIndex(
      (bl) => !bl.is_completed && !bl.is_skipped
    );
    return idx >= 0 ? idx : 0;
  });
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [rating, setRating] = useState<number | null>(() => {
    const idx = batchLeads.findIndex((bl) => !bl.is_completed && !bl.is_skipped);
    return batchLeads[idx >= 0 ? idx : 0]?.lead?.quality_rating ?? null;
  });
  const [isPending, startTransition] = useTransition();

  const current = batchLeads[currentIdx];
  const lead = current?.lead;
  const total = batchLeads.length;
  const completed = batchLeads.filter((bl) => bl.is_completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  function goNext() {
    const nextIdx = batchLeads.findIndex(
      (bl, i) => i > currentIdx && !bl.is_completed && !bl.is_skipped
    );
    if (nextIdx >= 0) {
      setCurrentIdx(nextIdx);
      setRating(batchLeads[nextIdx]?.lead?.quality_rating ?? null);
    } else if (currentIdx < total - 1) {
      setCurrentIdx(currentIdx + 1);
      setRating(batchLeads[currentIdx + 1]?.lead?.quality_rating ?? null);
    }
  }

  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setRating(batchLeads[currentIdx - 1]?.lead?.quality_rating ?? null);
    }
  }

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  function validateForm(): string[] {
    const errors: string[] = [];

    // Check required fields
    for (const field of enrichmentFields) {
      if (field.is_required) {
        const val = formData[field.key] ?? (lead?.data as Record<string, unknown>)?.[field.key];
        if (!val || String(val).trim() === "") {
          errors.push(`"${field.label}" is required.`);
        }
      }
    }

    // Check that at least email or phone is present (in form data or existing lead data)
    const emailFields = enrichmentFields.filter(
      (f) => f.type === "email" || f.label.toLowerCase().includes("email")
    );
    const phoneFields = enrichmentFields.filter(
      (f) => f.type === "phone" || f.label.toLowerCase().includes("phone")
    );

    if (emailFields.length > 0 || phoneFields.length > 0) {
      const hasEmail = emailFields.some((f) => {
        const val = formData[f.key] ?? (lead?.data as Record<string, unknown>)?.[f.key] ?? lead?.email;
        return val && String(val).trim() !== "";
      });
      const hasPhone = phoneFields.some((f) => {
        const val = formData[f.key] ?? (lead?.data as Record<string, unknown>)?.[f.key];
        return val && String(val).trim() !== "";
      });

      // Also check top-level lead.email
      const hasTopLevelEmail = lead?.email && lead.email.trim() !== "";

      if (!hasEmail && !hasPhone && !hasTopLevelEmail) {
        errors.push("At least an email or phone number must be provided.");
      }
    }

    return errors;
  }

  function handleComplete() {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    startTransition(async () => {
      await completeBatchLead(batch.id, current.lead_id, formData);
      setFormData({});
      goNext();
    });
  }

  function handleSkip() {
    startTransition(async () => {
      await skipBatchLead(batch.id, current.lead_id);
      goNext();
    });
  }

  function handleFlag() {
    const reason = window.prompt("Flag reason:");
    if (!reason) return;
    startTransition(async () => {
      await flagBatchLead(batch.id, current.lead_id, reason);
    });
  }

  function updateField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="flex h-full flex-col bg-(--color-bg)">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-5">
        <Link
          href="/enrichment"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight text-(--color-fg)">
            {batch.name}
          </h1>
          <div className="flex items-center gap-3 text-sm text-(--color-fg-muted)">
            <span>
              {completed}/{total} enriched
            </span>
            <span className="text-(--color-fg-subtle)">{pct}%</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-48">
          <div className="h-1.5 w-full rounded-full bg-(--color-surface-4) overflow-hidden">
            <div
              className="h-full rounded-full bg-(--color-accent) transition-all shadow-(--shadow-glow)"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {!current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-(--color-fg)">All leads processed!</p>
          <Link href="/enrichment">
            <Button variant="secondary" size="sm">
              Back to Batches
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Lead sidebar (quick nav) */}
          <div className="w-64 shrink-0 overflow-y-auto bg-(--color-surface-1) rounded-2xl m-3 shadow-(--shadow-card) border border-(--color-card-border)">
            <div className="p-3 space-y-0.5">
            {batchLeads.map((bl, i) => (
              <button
                key={bl.lead_id}
                type="button"
                onClick={() => setCurrentIdx(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  i === currentIdx
                    ? "bg-(--color-accent)/10 text-(--color-accent-text) font-medium"
                    : "text-(--color-fg-muted) hover:bg-(--color-surface-2)",
                  bl.is_completed && "opacity-50"
                )}
              >
                {bl.is_completed ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-(--color-success)" />
                ) : bl.is_skipped ? (
                  <SkipForward className="h-3 w-3 shrink-0 text-(--color-fg-subtle)" />
                ) : bl.is_flagged ? (
                  <Flag className="h-3 w-3 shrink-0 text-(--color-warn)" />
                ) : (
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-(--color-border) text-[8px]">
                    {i + 1}
                  </span>
                )}
                <span className="truncate">
                  {bl.lead.name || bl.lead.email || `Lead ${i + 1}`}
                </span>
              </button>
            ))}
            </div>
          </div>

          {/* Main form area */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6 md:p-10">
            {/* Lead info header */}
            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-(--color-fg) tracking-tight">
                {lead.name || "Unnamed Lead"}
              </h2>
              <div className="flex gap-3 text-sm text-(--color-fg-muted)">
                {lead.email && <span>{lead.email}</span>}
                {lead.company && <span>· {lead.company}</span>}
              </div>
              {current.is_completed && (
                <Badge tone="success">Already enriched</Badge>
              )}
              {current.is_flagged && (
                <Badge tone="warn">
                  Flagged: {current.flag_reason}
                </Badge>
              )}
            </div>

            {/* Existing data preview */}
            {Object.keys(lead.data).length > 0 && (
              <div className="mb-8 rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                  Existing Data
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(lead.data).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-(--color-fg-subtle)">
                        {k}:
                      </span>{" "}
                      <span>{String(v ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality Rating */}
            <div className="mb-8 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Lead Quality Rating
              </h3>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={rating ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : Math.min(10, Math.max(0, parseFloat(e.target.value)));
                    setRating(val);
                  }}
                  onBlur={() => {
                    startTransition(async () => {
                      await updateLeadRating(current.lead_id, rating);
                    });
                  }}
                  placeholder="—"
                  className="h-10 w-20 rounded-xl border-0 bg-(--color-surface-2) px-3 text-center text-lg font-bold text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                />
                <span className="text-sm font-medium text-(--color-fg-muted)">
                  / 10
                </span>
              </div>
            </div>

            {/* Enrichment form */}
            {enrichmentFields.length === 0 ? (
              <div className="rounded-2xl bg-(--color-surface-1) p-8 text-center text-sm text-(--color-fg-subtle) shadow-(--shadow-card) border border-(--color-card-border)">
                No enrichment fields defined. Go to the folder&apos;s Columns
                tab and mark fields as enrichment fields.
              </div>
            ) : (
              <div className="space-y-4">
                {enrichmentFields.map((field) => {
                  const val =
                    (formData[field.key] as string) ??
                    (lead.data as Record<string, unknown>)[field.key] ??
                    "";

                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                        {field.label}
                        {field.is_required && (
                          <span className="text-(--color-danger)">
                            {" "}
                            *
                          </span>
                        )}
                      </label>
                      {field.description && (
                        <p className="text-[11px] text-(--color-fg-disabled)">
                          {field.description}
                        </p>
                      )}
                      {field.type === "dropdown" ? (
                        <select
                          value={String(val)}
                          onChange={(e) =>
                            updateField(field.key, e.target.value)
                          }
                          className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none transition-all"
                        >
                          <option value="">Select…</option>
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) =>
                            updateField(field.key, e.target.checked)
                          }
                          className="accent-(--color-accent)"
                        />
                      ) : field.type === "number" ? (
                        <Input
                          type="number"
                          value={String(val)}
                          onChange={(e) =>
                            updateField(field.key, e.target.value)
                          }
                        />
                      ) : (
                        <Input
                          type={
                            field.type === "email"
                              ? "email"
                              : field.type === "url"
                              ? "url"
                              : field.type === "date"
                              ? "date"
                              : "text"
                          }
                          value={String(val)}
                          onChange={(e) =>
                            updateField(field.key, e.target.value)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="mt-6 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 space-y-1">
                {validationErrors.map((err, i) => (
                  <p key={i} className="text-sm text-red-400">{err}</p>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-10 flex items-center justify-between pt-6">
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goPrev}
                  disabled={currentIdx === 0}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  <SkipForward className="h-3.5 w-3.5" /> Skip
                </Button>
                <Button variant="ghost" size="sm" onClick={handleFlag}>
                  <Flag className="h-3.5 w-3.5" /> Flag
                </Button>
              </div>
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={isPending || current.is_completed}
              >
                {isPending ? "Saving…" : "Mark Enriched"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
