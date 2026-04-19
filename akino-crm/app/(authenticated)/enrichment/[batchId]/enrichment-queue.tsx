"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  SkipForward,
  Flag,
  Phone,
  Mail,
  Link2,
  User,
  Calendar,
  Hash,
  FileText,
  Globe,
  PictureInPicture2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEnrichmentPip } from "./use-enrichment-pip";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

// Map field types/labels to icons
function fieldIcon(field: FieldDefinition): LucideIcon {
  const label = field.label.toLowerCase();
  if (field.type === "phone" || label.includes("phone")) return Phone;
  if (field.type === "email" || label.includes("email")) return Mail;
  if (field.type === "url" || label.includes("linkedin") || label.includes("url")) return Link2;
  if (label.includes("name") || label.includes("decision") || label.includes("contact")) return User;
  if (field.type === "date") return Calendar;
  if (field.type === "number") return Hash;
  return FileText;
}

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
  const { pipWindow, isOpening, snapBack, isSupported, openPip, closePip } = useEnrichmentPip();
  const [isPopping, setIsPopping] = useState(false);

  const current = batchLeads[currentIdx];
  const lead = current?.lead;
  const total = batchLeads.length;
  const completed = batchLeads.filter((bl) => bl.is_completed).length;
  const needsEnrichment = batchLeads.filter((bl) => !bl.is_completed && !bl.is_skipped).length;

  function goNext() {
    const nextIdx = batchLeads.findIndex(
      (bl, i) => i > currentIdx && !bl.is_completed && !bl.is_skipped
    );
    if (nextIdx >= 0) {
      setCurrentIdx(nextIdx);
      setFormData({});
      setRating(batchLeads[nextIdx]?.lead?.quality_rating ?? null);
    } else if (currentIdx < total - 1) {
      setCurrentIdx(currentIdx + 1);
      setFormData({});
      setRating(batchLeads[currentIdx + 1]?.lead?.quality_rating ?? null);
    }
  }

  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setFormData({});
      setRating(batchLeads[currentIdx - 1]?.lead?.quality_rating ?? null);
    }
  }

  function selectLead(idx: number) {
    setCurrentIdx(idx);
    setFormData({});
    setRating(batchLeads[idx]?.lead?.quality_rating ?? null);
    setValidationErrors([]);
  }

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  function validateForm(): string[] {
    const errors: string[] = [];
    for (const field of enrichmentFields) {
      if (field.is_required) {
        const val = formData[field.key] ?? (lead?.data as Record<string, unknown>)?.[field.key];
        if (!val || String(val).trim() === "") {
          errors.push(`"${field.label}" is required.`);
        }
      }
    }
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

  // Compute missing fields for a lead
  function getMissingFields(bl: BLWithLead): string[] {
    const missing: string[] = [];
    const data = bl.lead.data as Record<string, unknown>;
    for (const f of enrichmentFields) {
      const val = data[f.key];
      if (!val || String(val).trim() === "") {
        missing.push(f.label);
      }
    }
    return missing;
  }

  // All done state
  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-(--color-bg)">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--color-success)/10">
          <CheckCircle2 className="h-8 w-8 text-(--color-success)" />
        </div>
        <p className="text-lg font-bold text-(--color-fg)">All leads processed!</p>
        <Link href="/enrichment">
          <Button variant="secondary" size="sm">
            Back to Batches
          </Button>
        </Link>
      </div>
    );
  }

  const leadData = lead.data as Record<string, unknown>;

  return (
    <div className="flex h-full overflow-hidden bg-(--color-bg)">
      {/* ── Pane 1: Lead Queue List ── */}
      <section
        className="shrink-0 flex flex-col bg-(--color-bg) border-r-2 border-(--color-card-border) overflow-hidden"
        style={{ width: 300, minWidth: 220, maxWidth: 440, resize: "horizontal", overflow: "hidden" }}
      >
        <header className="p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/enrichment"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-semibold text-(--color-fg) tracking-tight">Queue</h1>
          </div>
          <p className="text-sm text-(--color-fg-muted)">
            {needsEnrichment} Lead{needsEnrichment !== 1 ? "s" : ""} needing enrichment
          </p>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2" style={{ scrollbarWidth: "none" }}>
          {batchLeads.map((bl, i) => {
            const missing = getMissingFields(bl);
            const isActive = i === currentIdx;
            return (
              <button
                key={bl.lead_id}
                type="button"
                onClick={() => selectLead(i)}
                className={cn(
                  "w-full text-left p-4 rounded-lg flex items-start gap-3 transition-all",
                  isActive
                    ? "bg-(--color-surface-3) shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
                    : "bg-transparent hover:bg-(--color-surface-2) hover:scale-[1.02]",
                  bl.is_completed && "opacity-50"
                )}
              >
                <span
                  className={cn(
                    "font-medium text-sm mt-0.5 shrink-0",
                    isActive ? "text-(--color-fg-muted)" : "text-(--color-fg-subtle)"
                  )}
                >
                  {bl.is_completed ? (
                    <CheckCircle2 className="h-4 w-4 text-(--color-success)" />
                  ) : bl.is_skipped ? (
                    <SkipForward className="h-4 w-4 text-(--color-fg-subtle)" />
                  ) : bl.is_flagged ? (
                    <Flag className="h-4 w-4 text-(--color-warn)" />
                  ) : (
                    <>{i + 1}</>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className={cn("font-medium text-sm truncate", isActive ? "text-(--color-fg)" : "text-(--color-fg)")}>
                    {bl.lead.name || bl.lead.company || bl.lead.email || `Lead ${i + 1}`}
                  </h3>
                  {missing.length > 0 && !bl.is_completed && (
                    <p className="text-xs text-(--color-fg-muted) mt-1 truncate">
                      Missing: {missing.join(", ")}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Pane 2: Existing Data ── */}
      <section className="flex-1 flex flex-col bg-(--color-surface-1) overflow-hidden">
        <header className="p-8 pb-4 shrink-0">
          <h2 className="text-2xl font-bold text-(--color-fg) tracking-tight">
            {lead.name || lead.company || "Unnamed Lead"}
          </h2>
          <p className="text-sm text-(--color-fg-muted) mt-2">Existing Data</p>
        </header>
        <div className="flex-1 overflow-y-auto p-8 pt-4">
          <div className="rounded-2xl border-2 border-(--color-card-border) shadow-(--shadow-card-3d) bg-(--color-surface-1) p-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {/* Top-level lead fields */}
              {(lead.company || lead.name) && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Company Name</p>
                  <p className="text-sm text-(--color-fg) break-words">{lead.company || lead.name}</p>
                </div>
              )}
              {lead.email && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Email</p>
                  <a href={`mailto:${lead.email}`} className="text-sm text-(--color-accent) hover:underline decoration-(--color-accent)/30 underline-offset-4 break-all">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.name && lead.company && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Contact Name</p>
                  <p className="text-sm text-(--color-fg) break-words">{lead.name}</p>
                </div>
              )}
              {lead.status && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Status</p>
                  <p className="text-sm text-(--color-fg) break-words">{lead.status}</p>
                </div>
              )}
              {lead.tags && lead.tags.length > 0 && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Tags</p>
                  <p className="text-sm text-(--color-fg) break-words">{lead.tags.join(", ")}</p>
                </div>
              )}
              {/* Dynamic data fields */}
              {Object.entries(leadData).map(([key, val]) => {
                if (val === null || val === undefined || val === "") return null;
                const strVal = Array.isArray(val)
                  ? val.map(String).join(", ")
                  : typeof val === "object"
                  ? JSON.stringify(val)
                  : String(val);
                if (strVal.trim() === "") return null;
                const displayKey = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const isUrl = strVal.startsWith("http://") || strVal.startsWith("https://");
                const isLong = strVal.length > 80;
                return (
                  <div key={key} className={cn("min-w-0", isLong && "col-span-2")}>
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">{displayKey}</p>
                    {isUrl ? (
                      <a
                        href={strVal.startsWith("http") ? strVal : `https://${strVal}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-(--color-accent) hover:underline decoration-(--color-accent)/30 underline-offset-4 break-all"
                      >
                        {strVal}
                      </a>
                    ) : (
                      <p className="text-sm text-(--color-fg) break-words">{strVal}</p>
                    )}
                  </div>
                );
              })}
              {lead.notes && (
                <div className="col-span-2 min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Notes</p>
                  <p className="text-sm text-(--color-fg-muted) leading-relaxed break-words">{lead.notes}</p>
                </div>
              )}
            </div>
            {/* Empty state */}
            {!lead.name && !lead.email && !lead.company && Object.keys(leadData).length === 0 && !lead.notes && (
              <p className="text-sm text-(--color-fg-subtle) py-8 text-center">No existing data for this lead.</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Pane 3: Enrichment Form ── */}
      {/* When popped out → show placeholder; on snap-back → animate in */}
      {pipWindow ? (
        <section
          className="shrink-0 flex flex-col items-center justify-center bg-(--color-bg) border-l-2 border-(--color-card-border)"
          style={{ width: 420, minWidth: 320, maxWidth: 600 }}
        >
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-(--color-accent-muted) animate-pulse">
              <PictureInPicture2 className="h-6 w-6 text-(--color-accent)" />
            </div>
            <p className="text-sm font-semibold text-(--color-fg)">Form is floating</p>
            <p className="text-xs text-(--color-fg-muted) max-w-[200px] leading-relaxed">
              Fill in the floating window. Close it or click below to snap back.
            </p>
            <button
              type="button"
              onClick={closePip}
              className="mt-1 text-xs font-medium text-(--color-accent) hover:underline underline-offset-4 transition-colors"
            >
              ↩ Snap back
            </button>
          </div>
        </section>
      ) : (
      <section
        className={cn(
          "shrink-0 flex flex-col bg-(--color-bg) border-l-2 border-(--color-card-border) overflow-hidden shadow-[-8px_0_32px_rgba(0,0,0,0.15)]",
          snapBack && "animate-snap-back",
          isPopping && "animate-pip-fly-out"
        )}
        style={{ width: 420, minWidth: 320, maxWidth: 600, resize: "horizontal", overflow: "auto" }}
      >
        <header className="p-8 pb-4 shrink-0 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-(--color-fg) tracking-tight">Fill in what you find</h2>
            {current.is_completed && (
              <Badge tone="success" className="mt-2">Already enriched</Badge>
            )}
            {current.is_flagged && (
              <Badge tone="warn" className="mt-2">Flagged: {current.flag_reason}</Badge>
            )}
          </div>
          {isSupported && (
            <button
              type="button"
              title="Pop out as floating window"
              onClick={async () => {
                setIsPopping(true);
                await openPip();
                setTimeout(() => setIsPopping(false), 320);
              }}
              disabled={isOpening}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-(--color-surface-3) text-(--color-fg-muted) hover:bg-(--color-surface-4) hover:text-(--color-accent) transition-all disabled:opacity-50"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8 pt-4">
          {enrichmentFields.length === 0 ? (
            <div className="rounded-xl bg-(--color-surface-2) p-8 text-center text-sm text-(--color-fg-subtle)">
              No enrichment fields defined. Configure fields from the folder settings.
            </div>
          ) : (
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              {enrichmentFields.map((field) => {
                const Icon = fieldIcon(field);
                const val =
                  (formData[field.key] as string) ??
                  (leadData[field.key] as string) ??
                  "";

                return (
                  <div key={field.id} className="space-y-1.5">
                    <label className="block text-sm font-medium text-(--color-fg)">
                      {field.label}
                      {field.is_required && (
                        <span className="text-(--color-danger)"> *</span>
                      )}
                    </label>
                    {field.type === "dropdown" ? (
                      <select
                        value={String(val)}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        className="w-full bg-(--color-surface-3) border-none rounded-lg py-3 px-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) transition-all"
                      >
                        <option value="">Select…</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <div className="flex items-center gap-3 bg-(--color-surface-3) rounded-lg py-3 px-4">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => updateField(field.key, e.target.checked)}
                          className="accent-(--color-accent) h-4 w-4"
                        />
                        <span className="text-sm text-(--color-fg-muted)">Yes</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Icon className="h-4 w-4 text-(--color-fg-subtle)" />
                        </div>
                        <input
                          type={
                            field.type === "email" ? "email"
                              : field.type === "url" ? "url"
                              : field.type === "phone" ? "tel"
                              : field.type === "date" ? "date"
                              : field.type === "number" ? "number"
                              : "text"
                          }
                          value={String(val)}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          placeholder={field.description || field.label}
                          className="w-full bg-(--color-surface-3) border-none rounded-lg py-3 pl-10 pr-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) transition-all"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Notes / Comments — resizable */}
              <div className="space-y-1.5 pt-2 border-t border-(--color-card-border)">
                <label className="block text-sm font-medium text-(--color-fg)">
                  Notes / Comments
                </label>
                <textarea
                  value={(formData["__notes"] as string) ?? ""}
                  onChange={(e) => updateField("__notes", e.target.value)}
                  placeholder="Add any notes or comments about this lead…"
                  rows={3}
                  className="w-full bg-(--color-surface-3) border-none rounded-lg py-3 px-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) transition-all text-sm leading-relaxed"
                  style={{ resize: "vertical", minHeight: 80 }}
                />
              </div>

              {/* Quality Rating */}
              <div className="space-y-1.5 pt-2 border-t border-(--color-card-border)">
                <label className="block text-sm font-medium text-(--color-fg)">
                  Lead Quality
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={rating ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Math.min(10, Math.max(0, parseFloat(e.target.value)));
                      setRating(v);
                    }}
                    onBlur={() => {
                      startTransition(async () => {
                        await updateLeadRating(current.lead_id, rating);
                      });
                    }}
                    placeholder="—"
                    className="h-10 w-20 rounded-lg border-0 bg-(--color-surface-3) px-3 text-center text-lg font-bold text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                  />
                  <span className="text-sm font-medium text-(--color-fg-muted)">/ 10</span>
                </div>
              </div>
            </form>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="mt-6 rounded-xl bg-(--color-danger)/10 border border-(--color-danger)/20 p-4 space-y-1">
              {validationErrors.map((err, i) => (
                <p key={i} className="text-sm text-(--color-danger)">{err}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-8 pt-4 border-t border-(--color-card-border) shrink-0 space-y-2">
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending || current.is_completed}
            className="w-full bg-(--color-accent) text-(--color-accent-fg) py-4 rounded-full font-semibold text-sm hover:bg-(--color-accent-hover) transition-colors shadow-[0_4px_16px_rgba(0,113,227,0.3)] disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Mark as Enriched"}
          </button>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleSkip}
              className="text-(--color-fg-muted) py-3 rounded-full font-medium text-sm hover:text-(--color-fg) transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleFlag}
              className="text-(--color-fg-muted) py-3 rounded-full font-medium text-sm hover:text-(--color-warn) transition-colors flex items-center gap-1.5"
            >
              <Flag className="h-3.5 w-3.5" /> Flag
            </button>
          </div>
        </footer>
      </section>
      )}

      {/* ── PiP Portal: render form into the floating window ── */}
      {pipWindow && createPortal(
        <div className="flex flex-col h-screen bg-(--color-bg) animate-pip-enter" style={{ overflow: "hidden" }}>
          {/* PiP header with snap-back */}
          <header className="px-6 pt-5 pb-3 shrink-0 flex items-center gap-3 border-b border-(--color-card-border)">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-(--color-fg) tracking-tight">
                {lead.name || lead.company || "Enrichment"}
              </h2>
              {current.is_completed && <Badge tone="success" className="mt-1 text-xs">Already enriched</Badge>}
            </div>
            <button
              type="button"
              onClick={closePip}
              title="Snap back"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-(--color-surface-3) text-(--color-fg-muted) hover:bg-(--color-surface-4) hover:text-(--color-fg) transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          {/* Form content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {enrichmentFields.length === 0 ? (
              <div className="rounded-xl bg-(--color-surface-2) p-8 text-center text-sm text-(--color-fg-subtle)">
                No enrichment fields defined.
              </div>
            ) : (
              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                {enrichmentFields.map((field) => {
                  const Icon = fieldIcon(field);
                  const val =
                    (formData[field.key] as string) ??
                    ((lead?.data as Record<string, unknown>)[field.key] as string) ??
                    "";
                  return (
                    <div key={field.id} className="space-y-1.5">
                      <label className="block text-sm font-medium text-(--color-fg)">
                        {field.label}
                        {field.is_required && <span className="text-(--color-danger)"> *</span>}
                      </label>
                      {field.type === "dropdown" ? (
                        <select
                          value={String(val)}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 px-4 text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) transition-all text-sm"
                        >
                          <option value="">Select…</option>
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <div className="flex items-center gap-3 bg-(--color-surface-3) rounded-lg py-2.5 px-4">
                          <input
                            type="checkbox"
                            checked={!!val}
                            onChange={(e) => updateField(field.key, e.target.checked)}
                            className="accent-(--color-accent) h-4 w-4"
                          />
                          <span className="text-sm text-(--color-fg-muted)">Yes</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Icon className="h-4 w-4 text-(--color-fg-subtle)" />
                          </div>
                          <input
                            type={
                              field.type === "email" ? "email"
                                : field.type === "url" ? "url"
                                : field.type === "phone" ? "tel"
                                : field.type === "date" ? "date"
                                : field.type === "number" ? "number"
                                : "text"
                            }
                            value={String(val)}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            placeholder={field.description || field.label}
                            className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 pl-10 pr-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) transition-all text-sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Notes */}
                <div className="space-y-1.5 pt-2 border-t border-(--color-card-border)">
                  <label className="block text-sm font-medium text-(--color-fg)">Notes / Comments</label>
                  <textarea
                    value={(formData["__notes"] as string) ?? ""}
                    onChange={(e) => updateField("__notes", e.target.value)}
                    placeholder="Add any notes…"
                    rows={3}
                    className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 px-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) transition-all text-sm leading-relaxed"
                    style={{ resize: "vertical", minHeight: 72 }}
                  />
                </div>

                {/* Quality rating */}
                <div className="space-y-1.5 pt-2 border-t border-(--color-card-border)">
                  <label className="block text-sm font-medium text-(--color-fg)">Lead Quality</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0} max={10} step={0.1}
                      value={rating ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Math.min(10, Math.max(0, parseFloat(e.target.value)));
                        setRating(v);
                      }}
                      onBlur={() => {
                        startTransition(async () => {
                          await updateLeadRating(current.lead_id, rating);
                        });
                      }}
                      placeholder="—"
                      className="h-9 w-20 rounded-lg border-0 bg-(--color-surface-3) px-3 text-center text-base font-bold text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
                    />
                    <span className="text-sm font-medium text-(--color-fg-muted)">/ 10</span>
                  </div>
                </div>
              </form>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="mt-5 rounded-xl bg-(--color-danger)/10 border border-(--color-danger)/20 p-4 space-y-1">
                {validationErrors.map((err, i) => (
                  <p key={i} className="text-sm text-(--color-danger)">{err}</p>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="px-6 py-5 border-t border-(--color-card-border) shrink-0 space-y-2">
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending || current.is_completed}
              className="w-full bg-(--color-accent) text-(--color-accent-fg) py-3.5 rounded-full font-semibold text-sm hover:bg-(--color-accent-hover) transition-colors shadow-[0_4px_16px_rgba(0,194,204,0.3)] disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Mark as Enriched"}
            </button>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleSkip}
                className="text-(--color-fg-muted) py-2 rounded-full font-medium text-sm hover:text-(--color-fg) transition-colors"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={handleFlag}
                className="text-(--color-fg-muted) py-2 rounded-full font-medium text-sm hover:text-(--color-warn) transition-colors flex items-center gap-1.5"
              >
                <Flag className="h-3.5 w-3.5" /> Flag
              </button>
            </div>
          </footer>
        </div>,
        pipWindow.document.body
      )}
    </div>
  );
}
