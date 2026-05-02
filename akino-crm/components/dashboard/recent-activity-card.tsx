"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  StickyNote,
  ArrowRightLeft,
  CalendarClock,
  Trophy,
  XCircle,
  MoreHorizontal,
  CheckCircle,
  Sparkles,
  Zap,
  FolderPlus,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { ActivityLogEntry } from "@/lib/types";

const STORAGE_KEY = "akino:recent-activity:filters";
type CategoryFilter = "pipeline" | "enrichment" | "batch" | "all";

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  stage_change: ArrowRightLeft,
  follow_up_set: CalendarClock,
  won: Trophy,
  lost: XCircle,
  lead_enriched: Sparkles,
  enrichment_run_completed: Zap,
  enrichment_started: Zap,
  batch_created: FolderPlus,
  batch_deleted: Trash2,
  batch_restored: Undo2,
};

function useFilters(): [Set<CategoryFilter>, (key: CategoryFilter, on: boolean) => void] {
  const [filters, setFilters] = useState<Set<CategoryFilter>>(new Set(["all"]));

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFilters(new Set(JSON.parse(stored) as CategoryFilter[]));
    } catch {
      // ignore
    }
  }, []);

  function toggle(key: CategoryFilter, on: boolean) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (key === "all") {
        return on ? new Set(["all"]) : new Set<CategoryFilter>();
      }
      next.delete("all");
      if (on) next.add(key); else next.delete(key);
      if (next.size === 0) next.add("all");
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return [filters, toggle];
}

export function RecentActivityCard({
  activities,
}: {
  activities: ActivityLogEntry[];
}) {
  const [filters, toggle] = useFilters();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const showAll = filters.has("all");
  const filtered = activities
    .filter((a) => showAll || filters.has(a.category))
    .slice(0, 6);

  const FILTER_OPTIONS: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pipeline", label: "Pipeline" },
    { key: "enrichment", label: "Enrichment" },
    { key: "batch", label: "Batches" },
  ];

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 border border-(--color-border) transition-colors duration-200 hover:bg-white">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">
          Recent Activity
        </h3>
        <div className="flex items-center gap-3">
          <Link
            href="/activity"
            className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors text-sm font-medium"
          >
            View All
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Filter activity categories"
              onClick={() => setMenuOpen((v) => !v)}
              className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors p-1 rounded-lg hover:bg-(--color-surface-3)"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 w-48 rounded-2xl bg-(--color-surface-1) border border-(--color-border) p-3 flex flex-col gap-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-2 px-1">
                  Filter categories
                </p>
                {FILTER_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-(--color-surface-2) cursor-pointer text-sm text-(--color-fg)"
                  >
                    <input
                      type="checkbox"
                      checked={key === "all" ? filters.has("all") : filters.has(key)}
                      onChange={(e) => toggle(key, e.target.checked)}
                      className="rounded accent-(--color-accent)"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-(--color-fg-subtle)">No activity yet</p>
        ) : (
          filtered.map((a) => {
            const Icon = ACTIVITY_ICON[a.action] ?? StickyNote;
            const isWon = a.action === "won";
            return (
              <div key={a.id} className="flex items-start gap-4">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    isWon ? "bg-(--color-blue)/12" : "bg-(--color-surface-3)"
                  }`}
                >
                  {isWon ? (
                    <CheckCircle className="h-[18px] w-[18px] text-(--color-blue)" />
                  ) : (
                    <Icon className="h-[18px] w-[18px] text-(--color-fg)" />
                  )}
                </div>
                <div className="flex flex-col gap-1 pt-0.5 min-w-0">
                  <p className="text-sm font-medium text-(--color-fg) leading-snug">
                    {a.summary}
                  </p>
                  <p className="text-xs text-(--color-fg-muted)">
                    {relativeTime(a.occurred_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
