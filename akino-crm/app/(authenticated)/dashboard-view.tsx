"use client";

import Link from "next/link";
import {
  Phone,
  Mail,
  StickyNote,
  ArrowRightLeft,
  CalendarClock,
  Trophy,
  XCircle,
  ArrowRight,
  MoreHorizontal,
  CheckCircle,
} from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { Deal, PipelineStage, Activity, Notification } from "@/lib/types";

type DashboardData = {
  stages: PipelineStage[];
  stageCounts: Record<string, number>;
  followUps: Deal[];
  recentActivities: Activity[];
  folderStats: { id: string; name: string; total: number; enriched: number }[];
  notifications: Notification[];
};

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  stage_change: ArrowRightLeft,
  follow_up_set: CalendarClock,
  won: Trophy,
  lost: XCircle,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function DashboardView({ data }: { data: DashboardData }) {
  const totalActive = data.stages
    .filter((s) => !s.is_won && !s.is_lost)
    .reduce((sum, s) => sum + (data.stageCounts[s.id] ?? 0), 0);
  const wonCount = data.stages
    .filter((s) => s.is_won)
    .reduce((sum, s) => sum + (data.stageCounts[s.id] ?? 0), 0);
  const lostCount = data.stages
    .filter((s) => s.is_lost)
    .reduce((sum, s) => sum + (data.stageCounts[s.id] ?? 0), 0);

  const topFollowUp = data.followUps[0] ?? null;

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-6 space-y-6">
        {/* Greeting */}
        <div className="px-0 py-2">
          <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-(--color-fg) leading-tight pb-1">
            {getGreeting()}, RainKode
          </h2>
          <p className="text-base font-medium uppercase tracking-[0.02em] text-(--color-fg-muted)">
            {formatDate()}
          </p>
        </div>

        {/* Featured Follow-up Card */}
        {topFollowUp && (
          <div className="rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 shadow-(--shadow-card) border border-(--color-card-border) transition-transform hover:scale-[1.005] duration-300">
            <div className="flex items-stretch justify-between gap-6">
              <div className="flex flex-col gap-6 justify-between flex-[2]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-(--color-accent) animate-pulse" />
                    <p className="text-(--color-accent) text-xs font-bold uppercase tracking-wider">
                      {new Date(topFollowUp.follow_up_at!) < new Date()
                        ? "Overdue"
                        : "Due Soon"}
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-(--color-fg) leading-tight">
                    Today&apos;s Follow-ups
                  </p>
                  <p className="text-base text-(--color-fg-muted) mt-2 max-w-md leading-relaxed">
                    {topFollowUp.contact_name}
                    {topFollowUp.company && ` — ${topFollowUp.company}`}
                    {topFollowUp.notes && `. ${topFollowUp.notes}`}
                  </p>
                </div>
                <Link
                  href={`/pipeline?deal=${topFollowUp.id}`}
                  className="flex items-center justify-center gap-2 rounded-full h-10 px-6 bg-(--color-accent) text-(--color-accent-fg) text-sm font-bold w-fit hover:opacity-90 transition-opacity"
                >
                  View Deal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {/* Decorative background on large screens */}
              <div className="hidden sm:block w-1/3 rounded-xl bg-(--color-surface-2)" />
            </div>
          </div>
        )}

        {/* Pipeline Summary Stats */}
        <div className="flex flex-wrap gap-4">
          {/* New */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-2) hover:bg-(--color-surface-3) transition-colors shadow-(--shadow-card) border border-(--color-card-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              New
            </p>
            <p className="text-(--color-fg) text-3xl font-bold tracking-tight leading-none">
              {data.stageCounts[data.stages.find((s) => !s.is_won && !s.is_lost)?.id ?? ""] ?? 0}
            </p>
          </div>
          {/* In Progress */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-2) hover:bg-(--color-surface-3) transition-colors shadow-(--shadow-card) border border-(--color-card-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              In Progress
            </p>
            <p className="text-(--color-fg) text-3xl font-bold tracking-tight leading-none">
              {totalActive}
            </p>
          </div>
          {/* Won */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-2) hover:bg-(--color-surface-3) transition-colors relative overflow-hidden shadow-(--shadow-card) border border-(--color-card-border)">
            <div className="absolute inset-0 bg-(--color-accent)/5 pointer-events-none" />
            <p className="text-(--color-accent) text-xs font-bold uppercase tracking-wider relative z-10">
              Won
            </p>
            <p className="text-(--color-accent) text-3xl font-bold tracking-tight leading-none relative z-10">
              {wonCount}
            </p>
          </div>
          {/* Lost */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-2) hover:bg-(--color-surface-3) transition-colors opacity-70 shadow-(--shadow-card) border border-(--color-card-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              Lost
            </p>
            <p className="text-(--color-fg-muted) text-3xl font-bold tracking-tight leading-none">
              {lostCount}
            </p>
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Folder Summary */}
          <div className="flex flex-col gap-6 rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 shadow-(--shadow-card) border border-(--color-card-border)">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">
                Folder Summary
              </h3>
              <Link
                href="/folders"
                className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Link>
            </div>
            <div className="flex flex-col gap-6">
              {data.folderStats.length === 0 ? (
                <p className="text-sm text-(--color-fg-subtle)">
                  No folders yet. Create one to start.
                </p>
              ) : (
                data.folderStats.slice(0, 5).map((f) => {
                  const pct =
                    f.total > 0
                      ? Math.round((f.enriched / f.total) * 100)
                      : 0;
                  return (
                    <Link
                      key={f.id}
                      href={`/folders/${f.id}`}
                      className="flex flex-col gap-3 group"
                    >
                      <div className="flex justify-between items-end">
                        <p className="text-base font-medium text-(--color-fg) group-hover:text-(--color-accent-text) transition-colors">
                          {f.name}
                        </p>
                        <p className="text-sm text-(--color-fg-muted)">
                          <span className="text-(--color-fg) font-semibold">
                            {f.enriched}
                          </span>{" "}
                          / {f.total}
                        </p>
                      </div>
                      <div className="h-1.5 w-full bg-(--color-surface-4) rounded-full overflow-hidden">
                        <div
                          className="h-full bg-(--color-accent) rounded-full shadow-(--shadow-glow) transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="flex flex-col gap-6 rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 shadow-(--shadow-card) border border-(--color-card-border)">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">
                Recent Activity
              </h3>
              <button className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors text-sm font-medium">
                View All
              </button>
            </div>
            <div className="flex flex-col gap-5">
              {data.recentActivities.length === 0 ? (
                <p className="text-sm text-(--color-fg-subtle)">
                  No activity yet
                </p>
              ) : (
                data.recentActivities.slice(0, 6).map((a) => {
                  const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
                  const isWon = a.type === "won";
                  return (
                    <div key={a.id} className="flex items-start gap-4">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                          isWon
                            ? "bg-(--color-accent)/20"
                            : "bg-(--color-surface-4)"
                        }`}
                      >
                        {isWon ? (
                          <CheckCircle className="h-[18px] w-[18px] text-(--color-accent)" />
                        ) : (
                          <Icon className="h-[18px] w-[18px] text-(--color-fg)" />
                        )}
                      </div>
                      <div className="flex flex-col gap-1 pt-0.5">
                        <p className="text-sm font-medium text-(--color-fg) leading-snug">
                          {a.summary ?? a.type.replace(/_/g, " ")}
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
        </div>
      </div>
    </div>
  );
}
