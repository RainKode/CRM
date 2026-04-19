"use client";

import { useState, useTransition, useCallback } from "react";
import {
  Star,
  Search,
  Filter,
  ChevronDown,
  X,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import type { EnrichedLead } from "./actions";
import { getEnrichedLeads } from "./actions";

function ratingColor(rating: number | null): string {
  if (rating == null) return "text-(--color-fg-subtle)";
  if (rating >= 8) return "text-(--color-success)";
  if (rating >= 5) return "text-(--color-accent)";
  if (rating >= 3) return "text-(--color-warn)";
  return "text-(--color-danger)";
}

export function EnrichedView({
  initialLeads,
  folders,
}: {
  initialLeads: EnrichedLead[];
  folders: { id: string; name: string; count: number }[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [maxRating, setMaxRating] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedLead, setSelectedLead] = useState<EnrichedLead | null>(null);

  const hasFilters = !!folderId || minRating != null || maxRating != null;

  const applyFilters = useCallback(
    (overrides?: {
      search?: string;
      folderId?: string | null;
      minRating?: number | null;
      maxRating?: number | null;
    }) => {
      const s = overrides?.search ?? search;
      const f = overrides?.folderId !== undefined ? overrides.folderId : folderId;
      const min = overrides?.minRating !== undefined ? overrides.minRating : minRating;
      const max = overrides?.maxRating !== undefined ? overrides.maxRating : maxRating;

      startTransition(async () => {
        const results = await getEnrichedLeads({
          search: s || undefined,
          folderId: f || undefined,
          minRating: min ?? undefined,
          maxRating: max ?? undefined,
        });
        setLeads(results);
      });
    },
    [search, folderId, minRating, maxRating]
  );

  function handleSearch(val: string) {
    setSearch(val);
    applyFilters({ search: val });
  }

  function handleFolderFilter(id: string | null) {
    setFolderId(id);
    applyFilters({ folderId: id });
  }

  function handleRatingFilter(min: number | null, max: number | null) {
    setMinRating(min);
    setMaxRating(max);
    applyFilters({ minRating: min, maxRating: max });
  }

  function clearFilters() {
    setFolderId(null);
    setMinRating(null);
    setMaxRating(null);
    setSearch("");
    applyFilters({ search: "", folderId: null, minRating: null, maxRating: null });
  }

  const leadData = selectedLead?.data as Record<string, unknown> | undefined;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main list */}
      <div className={cn("flex-1 flex flex-col overflow-hidden", selectedLead && "hidden md:flex")}>
        <div className="pt-8 pb-4 px-6 md:px-12 max-w-6xl mx-auto w-full shrink-0">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
                Enriched Clients
              </h2>
              <p className="text-(--color-fg-muted) text-sm">
                {leads.length} enriched lead{leads.length !== 1 ? "s" : ""}
                {isPending && " · Loading…"}
              </p>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-fg-subtle)" />
              <input
                type="text"
                placeholder="Search by name, email, or company…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full h-10 rounded-xl bg-(--color-surface-2) border-none pl-10 pr-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
              />
            </div>

            {/* Filter button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-(--color-surface-2) hover:bg-(--color-surface-3) transition-colors text-sm font-medium text-(--color-fg)",
                  hasFilters
                    ? "border-(--color-accent)/50"
                    : "border-transparent"
                )}
              >
                <Filter className="h-4 w-4" />
                Filter
                {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent)" />}
                <ChevronDown className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-(--color-surface-1) border border-(--color-border)/30 shadow-(--shadow-popover) py-2 z-50">
                    <div className="px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle)">Filters</span>
                      {hasFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-xs text-(--color-accent) hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* Rating filter */}
                    <div className="border-t border-(--color-border)/15 my-1" />
                    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-fg-subtle)">By Rating</p>
                    {[
                      { label: "All ratings", min: null, max: null },
                      { label: "8+ (Excellent)", min: 8, max: null },
                      { label: "5–7.9 (Good)", min: 5, max: 7.9 },
                      { label: "3–4.9 (Average)", min: 3, max: 4.9 },
                      { label: "Below 3 (Low)", min: null, max: 2.9 },
                      { label: "Not rated", min: -1, max: -1 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          if (opt.min === -1) {
                            // "Not rated" — handled on server as null
                            handleRatingFilter(null, null);
                          } else {
                            handleRatingFilter(opt.min, opt.max);
                          }
                        }}
                        className={cn(
                          "w-full text-left px-4 py-1.5 text-sm transition-colors",
                          minRating === opt.min && maxRating === opt.max
                            ? "text-(--color-accent) bg-(--color-accent-muted)"
                            : "text-(--color-fg) hover:bg-(--color-surface-3)"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}

                    {/* Folder filter */}
                    <div className="border-t border-(--color-border)/15 my-1" />
                    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-fg-subtle)">By Folder</p>
                    <button
                      type="button"
                      onClick={() => handleFolderFilter(null)}
                      className={cn(
                        "w-full text-left px-4 py-1.5 text-sm transition-colors",
                        !folderId ? "text-(--color-accent) bg-(--color-accent-muted)" : "text-(--color-fg) hover:bg-(--color-surface-3)"
                      )}
                    >
                      All folders
                    </button>
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFolderFilter(f.id)}
                        className={cn(
                          "w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center justify-between",
                          folderId === f.id ? "text-(--color-accent) bg-(--color-accent-muted)" : "text-(--color-fg) hover:bg-(--color-surface-3)"
                        )}
                      >
                        <span>{f.name}</span>
                        <span className="text-xs text-(--color-fg-subtle)">{f.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 md:px-12">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <div className="h-14 w-14 rounded-full bg-(--color-surface-4) flex items-center justify-center">
                <Star className="h-6 w-6 text-(--color-fg-subtle)" />
              </div>
              <p className="text-sm text-(--color-fg-muted)">
                {hasFilters || search
                  ? "No enriched leads match your filters."
                  : "No enriched leads yet. Enrich leads from the Enrichment tab."}
              </p>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto w-full rounded-2xl border-2 border-(--color-card-border) overflow-hidden shadow-(--shadow-card-3d)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-(--color-surface-2) text-left text-xs uppercase tracking-wider text-(--color-fg-subtle)">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Company</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Folder</th>
                    <th className="px-4 py-3 font-semibold text-center">Rating</th>
                    <th className="px-4 py-3 font-semibold text-right">Enriched</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={cn(
                        "border-t border-(--color-card-border) hover:bg-(--color-surface-2)/50 transition-colors cursor-pointer",
                        selectedLead?.id === lead.id && "bg-(--color-accent)/5"
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-(--color-fg)">
                        {lead.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-(--color-fg-muted)">
                        {lead.company || "—"}
                      </td>
                      <td className="px-4 py-3 text-(--color-fg-muted)">
                        {lead.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{lead.folder_name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {lead.quality_rating != null ? (
                          <span className={cn("font-bold text-lg", ratingColor(lead.quality_rating))}>
                            {lead.quality_rating}
                          </span>
                        ) : (
                          <span className="text-(--color-fg-subtle)">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-(--color-fg-muted)">
                        {lead.enriched_at ? relativeTime(lead.enriched_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedLead && (
        <div className="w-full md:w-[420px] shrink-0 flex flex-col bg-(--color-bg) border-l border-(--color-card-border) overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 shrink-0">
            <h3 className="text-xl font-bold text-(--color-fg) tracking-tight truncate">
              {selectedLead.name || selectedLead.company || "Lead Details"}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedLead(null)}
              className="rounded-full h-8 w-8 flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Rating */}
            {selectedLead.quality_rating != null && (
              <div className="mb-6 flex items-center gap-3">
                <div className={cn("text-4xl font-bold", ratingColor(selectedLead.quality_rating))}>
                  {selectedLead.quality_rating}
                </div>
                <div className="text-sm text-(--color-fg-muted)">/ 10<br />Quality Rating</div>
              </div>
            )}

            <div className="rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) p-5 shadow-(--shadow-card-3d)">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {selectedLead.name && (
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Name</p>
                    <p className="text-sm text-(--color-fg) break-words">{selectedLead.name}</p>
                  </div>
                )}
                {selectedLead.company && (
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Company</p>
                    <p className="text-sm text-(--color-fg) break-words">{selectedLead.company}</p>
                  </div>
                )}
                {selectedLead.email && (
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Email</p>
                    <a href={`mailto:${selectedLead.email}`} className="text-sm text-(--color-accent) hover:underline break-all">{selectedLead.email}</a>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Folder</p>
                  <p className="text-sm text-(--color-fg) break-words">{selectedLead.folder_name}</p>
                </div>
                {selectedLead.tags && selectedLead.tags.length > 0 && (
                  <div className="col-span-2 min-w-0">
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedLead.tags.map((tag) => (
                        <Badge key={tag} tone="neutral">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {/* Dynamic data fields */}
                {leadData && Object.entries(leadData).map(([key, val]) => {
                  if (val === null || val === undefined || val === "") return null;
                  const strVal = Array.isArray(val) ? val.join(", ") : typeof val === "object" ? JSON.stringify(val) : String(val);
                  if (strVal.trim() === "") return null;
                  const displayKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const isUrl = strVal.startsWith("http://") || strVal.startsWith("https://");
                  const isLong = strVal.length > 60;
                  return (
                    <div key={key} className={cn("min-w-0", isLong && "col-span-2")}>
                      <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">{displayKey}</p>
                      {isUrl ? (
                        <a href={strVal} target="_blank" rel="noopener noreferrer" className="text-sm text-(--color-accent) hover:underline break-all flex items-center gap-1">
                          {strVal} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-sm text-(--color-fg) break-words">{strVal}</p>
                      )}
                    </div>
                  );
                })}
                {selectedLead.notes && (
                  <div className="col-span-2 min-w-0">
                    <p className="text-[11px] font-semibold text-(--color-fg-subtle) uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-sm text-(--color-fg-muted) leading-relaxed break-words whitespace-pre-wrap">{selectedLead.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
