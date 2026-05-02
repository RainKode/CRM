"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { MoreHorizontal, X, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FolderSummary } from "@/lib/types";

const STORAGE_KEY = "akino:folder-summary:visible-stats";
const DEFAULT_STATS = ["enrichment", "deal_count", "total_leads", "folders_count", "stage_breakdown"];

type StatKey = "enrichment" | "deal_count" | "total_leads" | "folders_count" | "stage_breakdown";

const STAT_LABELS: Record<StatKey, string> = {
  enrichment: "Enrichment %",
  deal_count: "Active deals",
  total_leads: "Total leads",
  folders_count: "Folders count",
  stage_breakdown: "Stage breakdown",
};

function useVisibleStats(): [Set<StatKey>, (key: StatKey, on: boolean) => void] {
  const [visible, setVisible] = useState<Set<StatKey>>(new Set(DEFAULT_STATS as StatKey[]));

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setVisible(new Set(JSON.parse(stored) as StatKey[]));
      }
    } catch {
      // ignore
    }
  }, []);

  function toggle(key: StatKey, on: boolean) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return [visible, toggle];
}

export function FolderSummaryCard({
  summaries,
}: {
  summaries: FolderSummary[];
}) {
  const [visible, toggle] = useVisibleStats();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const totalFolders = summaries.length;
  const totalLeads = summaries.reduce((s, f) => s + f.total_leads, 0);
  const totalEnriched = summaries.reduce((s, f) => s + f.enriched_leads, 0);
  const totalDeals = summaries.reduce((s, f) => s + f.active_deals, 0);
  const enrichPct = totalLeads > 0 ? Math.round((totalEnriched / totalLeads) * 100) : 0;

  return (
    <Link
      href="/folders"
      className="flex flex-col gap-6 rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 border border-(--color-border) transition-colors duration-200 hover:bg-white"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">
          Folder Summary
        </h3>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Customize folder summary stats"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors p-1 rounded-lg hover:bg-(--color-surface-3)"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-50 w-56 rounded-2xl bg-(--color-surface-1) border border-(--color-border) p-3 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-2 px-1">
                Visible stats
              </p>
              {(Object.keys(STAT_LABELS) as StatKey[]).map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-(--color-surface-2) cursor-pointer text-sm text-(--color-fg)"
                >
                  <input
                    type="checkbox"
                    checked={visible.has(key)}
                    onChange={(e) => toggle(key, e.target.checked)}
                    className="rounded accent-(--color-accent)"
                  />
                  {STAT_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Aggregate ribbon */}
      <div className="flex flex-wrap gap-3 text-sm text-(--color-fg-muted)">
        {visible.has("folders_count") && (
          <span className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-(--color-blue)" />
            <span className="font-semibold text-(--color-fg)">{totalFolders}</span> folders
          </span>
        )}
        {visible.has("total_leads") && (
          <span>
            <span className="font-semibold text-(--color-fg)">{totalLeads}</span> leads
          </span>
        )}
        {visible.has("enrichment") && (
          <span>
            <span className="font-semibold text-(--color-fg)">{totalEnriched}</span> enriched
            {" "}({enrichPct}%)
          </span>
        )}
        {visible.has("deal_count") && (
          <span>
            <span className="font-semibold text-(--color-fg)">{totalDeals}</span> deals
          </span>
        )}
      </div>

      {/* Per-folder rows */}
      <div className="flex flex-col gap-5">
        {summaries.length === 0 ? (
          <p className="text-sm text-(--color-fg-subtle)">
            No folders yet. Create one to start.
          </p>
        ) : (
          summaries.slice(0, 5).map((f) => {
            const pct = f.total_leads > 0 ? Math.round((f.enriched_leads / f.total_leads) * 100) : 0;
            const stageEntries = Object.entries(f.stage_breakdown ?? {}).slice(0, 4);

            return (
              <div key={f.folder_id} className="flex flex-col gap-2 group">
                <div className="flex justify-between items-end">
                  <p className="text-base font-medium text-(--color-fg) group-hover:text-(--color-blue) transition-colors">
                    {f.folder_name}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-(--color-fg-muted)">
                    {visible.has("deal_count") && f.active_deals > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--color-blue)/12 text-(--color-blue)">
                        {f.active_deals} deal{f.active_deals !== 1 ? "s" : ""}
                      </span>
                    )}
                    {visible.has("total_leads") && (
                      <span>
                        <span className="text-(--color-fg) font-semibold">{f.enriched_leads}</span>
                        {" "}/{" "}{f.total_leads}
                      </span>
                    )}
                  </div>
                </div>
                {visible.has("enrichment") && (
                  <div className="h-1.5 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                    <div
                      className="h-full bg-(--color-blue) rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {visible.has("stage_breakdown") && stageEntries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {stageEntries.map(([stage, count]) => (
                      <span
                        key={stage}
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-(--color-surface-3) text-(--color-fg-muted)"
                      >
                        {stage}
                        <span className={cn(
                          "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold",
                          "bg-(--color-surface-4) text-(--color-fg)"
                        )}>
                          {count}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Link>
  );
}
