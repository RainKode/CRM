"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft,
  Star,
  Mail,
  Building2,
  Calendar,
  Tag,
  FileText,
  Sparkles,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { Folder, FieldDefinition, Lead, Batch, BatchLead } from "@/lib/types";
import { updateLead } from "../../actions";
import { updateLeadRating } from "@/app/(authenticated)/enrichment/actions";

type BLWithBatch = BatchLead & { batch: Batch };

export function LeadDetail({
  lead: initialLead,
  folder,
  fields,
  batchHistory,
}: {
  lead: Lead;
  folder: Folder;
  fields: FieldDefinition[];
  batchHistory: BLWithBatch[];
}) {
  const [lead, setLead] = useState(initialLead);
  const [rating, setRating] = useState<number | null>(lead.quality_rating);
  const [isPending, startTransition] = useTransition();

  // Separate enrichment fields from regular fields
  const enrichmentFields = fields.filter((f) => f.is_enrichment);
  const regularFields = fields.filter((f) => !f.is_enrichment);

  function handleRating(star: number) {
    const newRating = rating === star ? null : star;
    setRating(newRating);
    startTransition(async () => {
      await updateLeadRating(lead.id, newRating);
    });
  }

  return (
    <div className="flex h-full flex-col bg-(--color-bg)">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-5">
        <Link
          href={`/folders/${folder.id}`}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-(--color-fg)">
            {lead.name || "Unnamed Lead"}
          </h1>
          <p className="text-sm text-(--color-fg-muted)">
            {folder.name} · Added {relativeTime(lead.created_at)}
          </p>
        </div>
        <Badge
          tone={
            lead.status === "enriched"
              ? "success"
              : lead.status === "in_pipeline"
              ? "accent"
              : "neutral"
          }
        >
          {lead.status}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Top info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Contact card */}
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">
                Contact
              </h3>
              <div className="space-y-3 text-sm">
                {lead.email && (
                  <div className="flex items-center gap-2 text-(--color-fg)">
                    <Mail className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.company && (
                  <div className="flex items-center gap-2 text-(--color-fg)">
                    <Building2 className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                    <span>{lead.company}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-(--color-fg-muted)">
                  <Calendar className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                  <span>{relativeTime(lead.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Quality Rating card */}
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">
                Lead Quality
              </h3>
              <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRating(star)}
                    className="group p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-7 w-7 transition-colors",
                        star <= (rating ?? 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-(--color-fg-subtle) group-hover:text-amber-300"
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="text-sm text-(--color-fg-muted)">
                {rating
                  ? `${rating} out of 5 stars`
                  : "Not rated yet — click to rate"}
              </p>
            </div>

            {/* Tags card */}
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </h3>
              {lead.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-(--color-accent)/10 px-3 py-1 text-xs font-medium text-(--color-accent)"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-(--color-fg-subtle)">No tags</p>
              )}
            </div>
          </div>

          {/* Lead Data — all fields */}
          <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
            <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Lead Data
            </h3>
            {regularFields.length === 0 && Object.keys(lead.data).length === 0 ? (
              <p className="text-sm text-(--color-fg-subtle)">No data fields</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {regularFields.map((field) => {
                  const val = (lead.data as Record<string, unknown>)[field.key];
                  return (
                    <div key={field.id} className="flex flex-col">
                      <span className="text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                        {field.label}
                      </span>
                      <span className="text-sm text-(--color-fg) mt-0.5">
                        {val != null && val !== ""
                          ? Array.isArray(val)
                            ? val.join(", ")
                            : String(val)
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Enrichment Data */}
          {enrichmentFields.length > 0 && (
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-(--color-accent)" />
                Enrichment Data
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {enrichmentFields.map((field) => {
                  const val = (lead.data as Record<string, unknown>)[field.key];
                  return (
                    <div key={field.id} className="flex flex-col">
                      <span className="text-xs font-semibold text-(--color-fg-subtle) uppercase tracking-wider">
                        {field.label}
                      </span>
                      <span className="text-sm text-(--color-fg) mt-0.5">
                        {val != null && val !== ""
                          ? Array.isArray(val)
                            ? val.join(", ")
                            : String(val)
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">
                Notes
              </h3>
              <p className="text-sm text-(--color-fg) whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Batch History */}
          {batchHistory.length > 0 && (
            <div className="rounded-2xl bg-(--color-surface-1) p-6 shadow-(--shadow-card) border border-(--color-card-border)">
              <h3 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">
                Enrichment Batch History
              </h3>
              <div className="space-y-2">
                {batchHistory.map((bh) => (
                  <Link
                    key={`${bh.batch_id}-${bh.lead_id}`}
                    href={`/enrichment/${bh.batch_id}`}
                    className="flex items-center justify-between rounded-xl bg-(--color-surface-2) px-4 py-3 text-sm hover:bg-(--color-surface-3) transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {bh.is_completed ? (
                        <CheckCircle2 className="h-4 w-4 text-(--color-success) shrink-0" />
                      ) : bh.is_skipped ? (
                        <Circle className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-(--color-accent) shrink-0" />
                      )}
                      <span className="font-medium text-(--color-fg)">
                        {bh.batch?.name ?? "Unknown Batch"}
                      </span>
                    </div>
                    <span className="text-(--color-fg-muted)">
                      {relativeTime(bh.added_at)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
