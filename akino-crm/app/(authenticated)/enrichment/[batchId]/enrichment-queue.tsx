"use client";

import { useState, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  SkipForward,
  Flag,
  BanIcon,
  Pencil,
  Check,
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
  unflagBatchLead,
  disqualifyBatchLead,
  updateLeadField,
  updateLeadRating,
} from "../actions";

type BLWithLead = BatchLead & { lead: Lead };

// Inline-editable field for Pane 2
function EditableField({
  label,
  fieldKey,
  value,
  editingField,
  editValue,
  startEdit,
  commitEdit,
  setEditValue,
  isEmail = false,
  isUrl = false,
  multiline = false,
}: {
  label: string;
  fieldKey: string;
  value: string;
  editingField: string | null;
  editValue: string;
  startEdit: (key: string, value: string) => void;
  commitEdit: (key: string) => void;
  setEditValue: (v: string) => void;
  isEmail?: boolean;
  isUrl?: boolean;
  multiline?: boolean;
}) {
  const isEditing = editingField === fieldKey;
  return (
    <div className="min-w-0 group">
      <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">{label}</p>
      {isEditing ? (
        <div className="flex items-start gap-1.5">
          {multiline ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(fieldKey)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(fieldKey); } if (e.key === "Escape") { setEditValue(value); commitEdit(fieldKey); } }}
              rows={3}
              className="flex-1 bg-(--color-surface-3) rounded-lg px-2 py-1.5 text-sm text-(--color-fg) border-none focus:ring-1 focus:ring-(--color-blue) outline-none resize-none"
            />
          ) : (
            <input
              autoFocus
              type={isEmail ? "email" : isUrl ? "url" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitEdit(fieldKey)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(fieldKey); if (e.key === "Escape") { setEditValue(value); commitEdit(fieldKey); } }}
              className="flex-1 bg-(--color-surface-3) rounded-lg px-2 py-1 text-sm text-(--color-fg) border-none focus:ring-1 focus:ring-(--color-blue) outline-none"
            />
          )}
          <button type="button" onClick={() => commitEdit(fieldKey)} className="mt-1 shrink-0 text-(--color-success) hover:opacity-75 transition-opacity">
            <Check className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => startEdit(fieldKey, value)}
          className="w-full text-left group/val flex items-start gap-1.5"
        >
          {isUrl ? (
            <span className="text-sm text-(--color-blue) break-all underline underline-offset-4 decoration-(--color-accent)/30">
              {value}
            </span>
          ) : isEmail ? (
            <span className="text-sm text-(--color-blue) break-all">{value}</span>
          ) : (
            <span className="text-sm text-(--color-fg) break-words">{value || <span className="text-(--color-fg-subtle) italic">empty</span>}</span>
          )}
          <Pencil className="h-3 w-3 text-(--color-fg-subtle) shrink-0 mt-0.5 opacity-0 group-hover/val:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
}

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

/** Return the best display label for a lead given the batch's preferred field. */
function displayFor(bl: BLWithLead, preferredKey: string | null | undefined): string {
  if (preferredKey) {
    const data = bl.lead.data as Record<string, unknown>;
    let val: string | null | undefined;
    if (preferredKey === "company") val = bl.lead.company;
    else if (preferredKey === "name") val = bl.lead.name;
    else if (preferredKey === "email") val = bl.lead.email;
    else val = data[preferredKey] != null ? String(data[preferredKey]) : undefined;
    if (val && val.trim()) return val.trim();
  }
  // Fall back to the original chain
  return bl.lead.name || bl.lead.company || bl.lead.email || "";
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
  // Prefer sort_by_field, then filter_by_field, then default chain
  const preferredDisplayKey = batch.sort_by_field ?? batch.filter_by_field ?? null;
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
  // Flag popover state
  const [showFlagMenu, setShowFlagMenu] = useState(false);
  const [customFlagReason, setCustomFlagReason] = useState("");
  const flagMenuRef = useRef<HTMLDivElement>(null);
  // Inline editing state for Pane 2
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  function handleFlag(reason: string) {
    setShowFlagMenu(false);
    setCustomFlagReason("");
    startTransition(async () => {
      await flagBatchLead(batch.id, current.lead_id, reason);
    });
  }

  function handleUnflag() {
    startTransition(async () => {
      await unflagBatchLead(batch.id, current.lead_id);
    });
  }

  function handleDisqualify() {
    startTransition(async () => {
      await disqualifyBatchLead(batch.id, current.lead_id);
      goNext();
    });
  }

  function startEdit(key: string, value: string) {
    setEditingField(key);
    setEditValue(value);
  }

  function commitEdit(key: string) {
    const val = editValue;
    setEditingField(null);
    startTransition(async () => {
      await updateLeadField(current.lead_id, key, val);
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
        className="shrink-0 flex flex-col bg-white border-r border-(--color-border) overflow-hidden"
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
                    ? "bg-(--color-surface-2)"
                    : "bg-transparent hover:bg-(--color-surface-2)",
                  bl.is_completed && "opacity-50"
                )}
              >
                <span
                  className={cn(
                    "font-medium text-sm mt-0.5 shrink-0",
                    isActive ? "text-(--color-fg-muted)" : "text-(--color-fg-subtle)"
                  )}
                >
                  {bl.is_disqualified ? (
                    <BanIcon className="h-4 w-4 text-(--color-danger)" />
                  ) : bl.is_completed ? (
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
                    {displayFor(bl, preferredDisplayKey) || `Lead ${i + 1}`}
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
            {displayFor(current, preferredDisplayKey) || "Unnamed Lead"}
          </h2>
          <p className="text-sm text-(--color-fg-muted) mt-2">Existing Data — click any field to edit</p>
        </header>
        <div className="flex-1 overflow-y-auto p-8 pt-4">
          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1) p-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {/* Top-level lead fields — editable */}
              {(lead.company || lead.name) && (
                <EditableField label="Company Name" fieldKey="company" value={String(lead.company || lead.name || "")} editingField={editingField} editValue={editValue} startEdit={startEdit} commitEdit={commitEdit} setEditValue={setEditValue} />
              )}
              {lead.email && (
                <EditableField label="Email" fieldKey="email" value={lead.email} editingField={editingField} editValue={editValue} startEdit={startEdit} commitEdit={commitEdit} setEditValue={setEditValue} isEmail />
              )}
              {lead.name && lead.company && (
                <EditableField label="Contact Name" fieldKey="name" value={lead.name} editingField={editingField} editValue={editValue} startEdit={startEdit} commitEdit={commitEdit} setEditValue={setEditValue} />
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
              {/* Dynamic data fields — editable */}
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
                const isLong = strVal.length > 80;
                const isUrl = strVal.startsWith("http://") || strVal.startsWith("https://");
                return (
                  <div key={key} className={cn("min-w-0", isLong && "col-span-2")}>
                    <EditableField label={displayKey} fieldKey={key} value={strVal} editingField={editingField} editValue={editValue} startEdit={startEdit} commitEdit={commitEdit} setEditValue={setEditValue} isUrl={isUrl} />
                  </div>
                );
              })}
              {lead.notes !== null && lead.notes !== undefined && (
                <div className="col-span-2 min-w-0">
                  <EditableField label="Notes" fieldKey="notes" value={lead.notes || ""} editingField={editingField} editValue={editValue} startEdit={startEdit} commitEdit={commitEdit} setEditValue={setEditValue} multiline />
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
          className="shrink-0 flex flex-col items-center justify-center bg-[#191c1f] text-white border-l border-(--color-border)"
          style={{ width: 420, minWidth: 320, maxWidth: 600 }}
        >
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 animate-pulse">
              <PictureInPicture2 className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Form is floating</p>
            <p className="text-xs text-white/60 max-w-[200px] leading-relaxed">
              Fill in the floating window. Close it or click below to snap back.
            </p>
            <button
              type="button"
              onClick={closePip}
              className="mt-1 text-xs font-medium text-white hover:underline underline-offset-4 transition-colors"
            >
              ↩ Snap back
            </button>
          </div>
        </section>
      ) : (
      <section
        className={cn(
          "shrink-0 flex flex-col bg-[#191c1f] text-white border-l border-(--color-border) overflow-hidden",
          snapBack && "animate-snap-back",
          isPopping && "animate-pip-fly-out"
        )}
        style={{ width: 420, minWidth: 320, maxWidth: 600, resize: "horizontal", overflow: "auto" }}
      >
        <header className="p-8 pb-4 shrink-0 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white tracking-tight">Fill in what you find</h2>
            {current.is_completed && (
              <Badge tone="success" className="mt-2">Already enriched</Badge>
            )}
            {current.is_flagged && (
              <Badge tone="warn" className="mt-2">Flagged: {current.flag_reason}</Badge>
            )}
            {current.is_disqualified && (
              <Badge tone="danger" className="mt-2">Disqualified</Badge>
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
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/16 hover:text-white transition-all disabled:opacity-50"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8 pt-4">
          {enrichmentFields.length === 0 ? (
            <div className="rounded-xl bg-white/8 p-8 text-center text-sm text-white/60">
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
                    <label className="block text-sm font-medium text-white/78">
                      {field.label}
                      {field.is_required && (
                        <span className="text-(--color-danger)"> *</span>
                      )}
                    </label>
                    {field.type === "dropdown" ? (
                      <select
                        value={String(val)}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        className="w-full min-h-12 bg-transparent border-0 border-b border-white/24 rounded-none py-3 px-0 text-white placeholder:text-white/35 focus:border-white focus:ring-0 outline-none transition-colors"
                      >
                        <option value="">Select…</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <div className="flex items-center gap-3 border-b border-white/24 py-3">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => updateField(field.key, e.target.checked)}
                          className="accent-white h-4 w-4"
                        />
                        <span className="text-sm text-white/62">Yes</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Icon className="h-4 w-4 text-white/38" />
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
                          className="w-full min-h-12 bg-transparent border-0 border-b border-white/24 rounded-none py-3 pl-10 pr-0 text-white placeholder:text-white/35 focus:border-white focus:ring-0 outline-none transition-colors"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Notes / Comments — resizable */}
              <div className="space-y-1.5 pt-2 border-t border-white/14">
                <label className="block text-sm font-medium text-white/78">
                  Notes / Comments
                </label>
                <textarea
                  value={(formData["__notes"] as string) ?? ""}
                  onChange={(e) => updateField("__notes", e.target.value)}
                  placeholder="Add any notes or comments about this lead…"
                  rows={3}
                  className="w-full bg-transparent border-0 border-b border-white/24 rounded-none py-3 px-0 text-white placeholder:text-white/35 focus:border-white focus:ring-0 outline-none transition-colors text-sm leading-relaxed"
                  style={{ resize: "vertical", minHeight: 80 }}
                />
              </div>

              {/* Quality Rating */}
              <div className="space-y-1.5 pt-2 border-t border-white/14">
                <label className="block text-sm font-medium text-white/78">
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
                    className="h-10 w-20 rounded-none border-0 border-b border-white/24 bg-transparent px-3 text-center text-lg font-bold text-white focus:border-white focus:ring-0 focus:outline-none"
                  />
                  <span className="text-sm font-medium text-white/60">/ 10</span>
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
        <footer className="p-8 pt-4 border-t border-white/14 shrink-0 space-y-3">
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending || current.is_completed || current.is_disqualified}
            className="w-full bg-white text-[#191c1f] py-4 rounded-full font-semibold text-sm hover:opacity-85 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Mark as Enriched"}
          </button>

          {/* Secondary actions row */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending}
              className="flex-1 text-white/62 py-2.5 rounded-full font-medium text-sm hover:text-white hover:bg-white/10 transition-colors"
            >
              Skip
            </button>

            {/* Flag button with inline popover */}
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => {
                  if (current.is_flagged) { handleUnflag(); return; }
                  setShowFlagMenu((v) => !v);
                }}
                disabled={isPending}
                className={cn(
                  "w-full py-2.5 rounded-full font-medium text-sm transition-colors flex items-center justify-center gap-1.5",
                  current.is_flagged
                    ? "bg-(--color-warn)/15 text-(--color-warn) hover:bg-(--color-warn)/25"
                    : "text-white/62 hover:text-(--color-warning) hover:bg-white/10"
                )}
              >
                <Flag className="h-3.5 w-3.5" />
                {current.is_flagged ? "Unflag" : "Flag"}
              </button>
              {showFlagMenu && (
                <div
                  ref={flagMenuRef}
                  className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl bg-(--color-surface-3) border border-(--color-border)  p-3 space-y-2"
                >
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-2">Flag reason</p>
                  {["Dead website", "Dead email", "Wrong contact", "Not suitable for campaign", "Duplicate"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleFlag(r)}
                      className="w-full text-left text-sm text-(--color-fg) px-3 py-2 rounded-lg hover:bg-(--color-surface-4) transition-colors"
                    >
                      {r}
                    </button>
                  ))}
                  <div className="pt-1 border-t border-(--color-border) flex gap-2">
                    <input
                      type="text"
                      placeholder="Custom reason…"
                      value={customFlagReason}
                      onChange={(e) => setCustomFlagReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && customFlagReason.trim()) handleFlag(customFlagReason.trim()); }}
                      className="flex-1 bg-(--color-surface-4) rounded-lg px-3 py-1.5 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) border-none focus:ring-1 focus:ring-(--color-blue) outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { if (customFlagReason.trim()) handleFlag(customFlagReason.trim()); }}
                      className="px-3 py-1.5 rounded-lg bg-(--color-accent) text-(--color-accent-fg) text-sm font-medium"
                    >
                      OK
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFlagMenu(false)}
                    className="w-full text-center text-xs text-(--color-fg-subtle) py-1 hover:text-(--color-fg) transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Disqualify button */}
            <button
              type="button"
              onClick={handleDisqualify}
              disabled={isPending || current.is_disqualified}
              title="Disqualify this lead from the campaign"
              className={cn(
                "flex-1 py-2.5 rounded-full font-medium text-sm transition-colors flex items-center justify-center gap-1.5",
                current.is_disqualified
                  ? "bg-(--color-danger)/15 text-(--color-danger) opacity-60 cursor-not-allowed"
                  : "text-white/62 hover:text-(--color-danger) hover:bg-(--color-danger)/10"
              )}
            >
              <BanIcon className="h-3.5 w-3.5" />
              {current.is_disqualified ? "DQ'd" : "Disqualify"}
            </button>
          </div>
        </footer>
      </section>
      )}

      {/* ── PiP Portal: render form into the floating window ── */}
      {pipWindow && createPortal(
        <div className="flex flex-col h-screen bg-(--color-bg) animate-pip-enter" style={{ overflow: "hidden" }}>
          {/* PiP header with snap-back */}
          <header className="px-6 pt-5 pb-3 shrink-0 flex items-center gap-3 border-b border-(--color-border)">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-(--color-fg) tracking-tight">
                {lead.name || lead.company || "Enrichment"}
              </h2>
              {current.is_completed && <Badge tone="success" className="mt-1 text-xs">Already enriched</Badge>}
              {current.is_disqualified && <Badge tone="danger" className="mt-1 text-xs">Disqualified</Badge>}
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
                          className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 px-4 text-(--color-fg) focus:ring-1 focus:ring-(--color-blue) transition-all text-sm"
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
                            className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 pl-10 pr-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-blue) transition-all text-sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Notes */}
                <div className="space-y-1.5 pt-2 border-t border-(--color-border)">
                  <label className="block text-sm font-medium text-(--color-fg)">Notes / Comments</label>
                  <textarea
                    value={(formData["__notes"] as string) ?? ""}
                    onChange={(e) => updateField("__notes", e.target.value)}
                    placeholder="Add any notes…"
                    rows={3}
                    className="w-full bg-(--color-surface-3) border-none rounded-lg py-2.5 px-4 text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-blue) transition-all text-sm leading-relaxed"
                    style={{ resize: "vertical", minHeight: 72 }}
                  />
                </div>

                {/* Quality rating */}
                <div className="space-y-1.5 pt-2 border-t border-(--color-border)">
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
                      className="h-9 w-20 rounded-lg border-0 bg-(--color-surface-3) px-3 text-center text-base font-bold text-(--color-fg) focus:ring-1 focus:ring-(--color-blue) focus:outline-none"
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
          <footer className="px-6 py-5 border-t border-(--color-border) shrink-0 space-y-2">
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending || current.is_completed || current.is_disqualified}
              className="w-full bg-(--color-accent) text-(--color-accent-fg) py-3.5 rounded-full font-semibold text-sm hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Mark as Enriched"}
            </button>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isPending}
                className="text-(--color-fg-muted) py-2 rounded-full font-medium text-sm hover:text-(--color-fg) transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => setShowFlagMenu((v) => !v)}
                disabled={isPending}
                className={cn(
                  "py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5",
                  current.is_flagged ? "text-(--color-warn)" : "text-(--color-fg-muted) hover:text-(--color-warn)"
                )}
              >
                <Flag className="h-3.5 w-3.5" /> {current.is_flagged ? "Unflag" : "Flag"}
              </button>
              <button
                type="button"
                onClick={handleDisqualify}
                disabled={isPending || current.is_disqualified}
                className={cn(
                  "py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5",
                  current.is_disqualified ? "text-(--color-danger) opacity-50 cursor-not-allowed" : "text-(--color-fg-muted) hover:text-(--color-danger)"
                )}
              >
                <BanIcon className="h-3.5 w-3.5" /> {current.is_disqualified ? "DQ'd" : "Disqualify"}
              </button>
            </div>
          </footer>
        </div>,
        pipWindow.document.body
      )}
    </div>
  );
}
