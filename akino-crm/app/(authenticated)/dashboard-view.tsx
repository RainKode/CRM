"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Inbox,
} from "lucide-react";
import type { Deal, PipelineStage, Activity, Notification, Task, FolderSummary, ActivityLogEntry } from "@/lib/types";
import { FolderSummaryCard } from "@/components/dashboard/folder-summary-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { Badge } from "@/components/ui/badge";

type DashboardData = {
  stages: PipelineStage[];
  stageCounts: Record<string, number>;
  followUps: Deal[];
  upcomingFollowUps: Deal[];
  recentActivities: Activity[];
  recentActivityLog: ActivityLogEntry[];
  folderStats: { id: string; name: string; total: number; enriched: number }[];
  folderSummaries: FolderSummary[];
  notifications: Notification[];
  openTasks: Task[];
  queueCount: number;
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
  const dueCount = data.followUps.length;
  const upcomingCount = data.upcomingFollowUps.length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-6 space-y-6">
        {/* Greeting */}
        <div className="px-0 py-2">
          <h2 className="font-display text-[32px] sm:text-[40px] font-semibold tracking-normal text-(--color-fg) leading-tight pb-1">
            {getGreeting()}, RainKode
          </h2>
          <p className="text-base font-medium uppercase tracking-[0.02em] text-(--color-fg-muted)">
            {formatDate()}
          </p>
        </div>

        {/* Follow-up Queue CTA — single entry point to everything due today */}
        <Link
          href="/queue"
          className="card group grid grid-cols-1 gap-7 rounded-2xl bg-(--color-fg) p-7 text-white transition-opacity hover:opacity-95 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end"
        >
          <div className="flex items-start gap-5 min-w-0">
            <div
              className={`h-12 w-12 flex-none rounded-full flex items-center justify-center ${
                data.queueCount > 0
                  ? "bg-white/10 text-white"
                  : "bg-(--color-teal)/15 text-(--color-teal)"
              }`}
            >
              <Inbox className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <Badge tone={data.queueCount > 0 ? "warn" : "success"}>
                {data.queueCount > 0 ? "Due today" : "Clear"}
              </Badge>
              <div className="font-display mt-4 text-[clamp(76px,9vw,132px)] font-semibold leading-[0.92] tracking-normal">
                {data.queueCount}
              </div>
              <h3 className="font-display mt-3 text-[clamp(30px,4.5vw,52px)] font-semibold leading-none tracking-normal text-white">
                {data.queueCount > 0
                  ? `${data.queueCount} item${data.queueCount === 1 ? "" : "s"} need you today`
                  : "Nothing due today"}
              </h3>
              <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
                Tasks, scheduled calls, and deal follow-ups in one queue.
              </p>
            </div>
          </div>
          <div className="hidden h-full rounded-2xl bg-white/8 p-4 sm:block">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16px] text-white/45">
              Next action
            </p>
            <p className="mt-3 text-sm font-semibold leading-snug text-white">
              {topFollowUp ? topFollowUp.contact_name : "Review the queue"}
            </p>
            <ArrowRight className="mt-5 h-5 w-5 text-white/60 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>

        {/* Featured Follow-up Card */}
        {topFollowUp && (
          <div className="rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 border border-(--color-border) transition-colors duration-200 hover:bg-white">
            <div className="flex items-stretch justify-between gap-6">
              <div className="flex flex-col gap-6 justify-between flex-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-(--color-warning) animate-pulse" />
                    <p className="text-(--color-warning) text-xs font-bold uppercase tracking-wider">
                      {new Date(topFollowUp.follow_up_at!) < new Date()
                        ? `${dueCount} Overdue`
                        : `${dueCount} Due Today`}
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
                  {dueCount > 1 && (
                    <p className="text-xs text-(--color-fg-subtle) mt-1">
                      + {dueCount - 1} more waiting for you.
                    </p>
                  )}
                </div>
                <Link
                  href={`/pipeline?deal=${topFollowUp.id}`}
                  className="flex items-center justify-center gap-2 rounded-full h-11 px-6 bg-(--color-fg) text-white text-sm font-bold w-fit hover:opacity-85 transition-opacity"
                >
                  View Deal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {/* Upcoming list (next 7 days, not yet due) */}
              <div className="hidden sm:flex w-1/3 flex-col rounded-xl bg-(--color-surface-2) p-4 gap-2 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                  Upcoming • {upcomingCount}
                </p>
                {data.upcomingFollowUps.length === 0 ? (
                  <p className="text-xs text-(--color-fg-subtle)">
                    Nothing scheduled in the next 7 days.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5 overflow-y-auto">
                    {data.upcomingFollowUps.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`/pipeline?deal=${d.id}`}
                        className="block rounded-lg px-2.5 py-1.5 hover:bg-(--color-surface-3) transition-colors min-w-0"
                      >
                        <div className="text-xs font-medium text-(--color-fg) truncate">
                          {d.contact_name}
                        </div>
                        <div className="text-[10px] text-(--color-fg-subtle)">
                          {new Date(d.follow_up_at!).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" }
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Zero-state card when no follow-ups at all */}
        {!topFollowUp && upcomingCount === 0 && (
          <div className="rounded-2xl bg-(--color-surface-1) p-6 border border-(--color-border)">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-(--color-blue)/12 flex items-center justify-center">
                <CalendarClock className="h-5 w-5 text-(--color-blue)" />
              </div>
              <div>
                <p className="text-sm font-semibold text-(--color-fg)">
                  All caught up
                </p>
                <p className="text-xs text-(--color-fg-muted)">
                  No follow-ups due today or in the next 7 days.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline Summary Stats */}
        <div className="flex flex-wrap gap-4">
          {/* New */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-1) hover:bg-white transition-colors duration-200 border border-(--color-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              New
            </p>
            <p className="font-display text-(--color-fg) text-3xl font-semibold tracking-normal leading-none">
              {data.stageCounts[data.stages.find((s) => !s.is_won && !s.is_lost)?.id ?? ""] ?? 0}
            </p>
          </div>
          {/* In Progress */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-1) hover:bg-white transition-colors duration-200 border border-(--color-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              In Progress
            </p>
            <p className="font-display text-(--color-fg) text-3xl font-semibold tracking-normal leading-none">
              {totalActive}
            </p>
          </div>
          {/* Won */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-blue) transition-colors duration-200 relative overflow-hidden border border-(--color-blue)">
            <p className="text-white/72 text-xs font-bold uppercase tracking-wider relative z-10">
              Won
            </p>
            <p className="font-display text-white text-3xl font-semibold tracking-normal leading-none relative z-10">
              {wonCount}
            </p>
          </div>
          {/* Lost */}
          <div className="flex min-w-[140px] flex-1 flex-col justify-between gap-4 rounded-2xl p-6 bg-(--color-surface-1) hover:bg-white transition-colors duration-200 opacity-70 border border-(--color-border)">
            <p className="text-(--color-fg-muted) text-xs font-bold uppercase tracking-wider">
              Lost
            </p>
            <p className="font-display text-(--color-fg-muted) text-3xl font-semibold tracking-normal leading-none">
              {lostCount}
            </p>
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Folder Summary */}
          <FolderSummaryCard summaries={data.folderSummaries} />

          {/* Tasks */}
          <div className="flex flex-col gap-4 rounded-2xl bg-(--color-surface-1) p-6 sm:p-8 border border-(--color-border) transition-colors duration-200 hover:bg-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-(--color-blue)" />
                <h3 className="text-xl font-bold text-(--color-fg) tracking-tight">
                  Tasks
                </h3>
                {data.openTasks.length > 0 && (
                  <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded-full bg-(--color-surface-3) text-(--color-fg-muted)">
                    {data.openTasks.length}
                  </span>
                )}
              </div>
              <Link
                href="/tasks"
                className="text-(--color-fg-muted) hover:text-(--color-fg) transition-colors text-sm font-medium"
              >
                View all
              </Link>
            </div>
            {data.openTasks.length === 0 ? (
              <p className="text-sm text-(--color-fg-subtle)">
                No open tasks.{" "}
                <Link href="/tasks" className="text-(--color-blue) hover:underline">
                  Create one →
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {data.openTasks.slice(0, 5).map((t) => {
                  const due = t.due_at ? new Date(t.due_at) : null;
                  const overdue = due ? due.getTime() < Date.now() : false;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-xl bg-(--color-surface-2) px-3 py-2.5"
                    >
                      <div className="mt-0.5 h-4 w-4 rounded-full border-2 border-(--color-fg-subtle) shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-(--color-fg) truncate">
                          {t.title}
                        </div>
                        {due && (
                          <div
                            className={
                              overdue
                                ? "text-[11px] font-medium text-(--color-danger)"
                                : "text-[11px] text-(--color-fg-muted)"
                            }
                          >
                            {overdue ? "Overdue • " : ""}
                            {due.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent Activity */}
          <RecentActivityCard activities={data.recentActivityLog} />
        </div>
      </div>
    </div>
  );
}
