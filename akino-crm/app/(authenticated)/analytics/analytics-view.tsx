"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  Trophy,
  Clock,
  Wallet,
  Workflow,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pipeline } from "@/lib/types";
import type { AnalyticsSummary, StageBreakdown } from "./actions";

function formatCurrency(n: number): string {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDays(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1) return "<1d";
  return `${Math.round(n)}d`;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

// ─── Small UI building blocks ─────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: React.ElementType;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-(--color-success)/10 text-(--color-success)"
      : tone === "danger"
      ? "bg-(--color-danger)/10 text-(--color-danger)"
      : "bg-(--color-blue)/12 text-(--color-blue)";
  return (
    <div className="rounded-2xl border border-(--color-surface-4) bg-(--color-surface-1) p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wide text-(--color-fg-muted)">
          {label}
        </span>
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            toneClass
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-(--color-fg)">{value}</div>
      {sub && <div className="text-xs text-(--color-fg-muted) mt-1">{sub}</div>}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AnalyticsView({
  pipelines,
  summary,
  selectedPipelineId,
}: {
  pipelines: Pipeline[];
  summary: AnalyticsSummary;
  selectedPipelineId: string;
}) {
  const router = useRouter();
  const maxStageCount = Math.max(1, ...summary.stages.map((s) => s.count));
  const maxVelocity = Math.max(
    1,
    ...summary.stages.map((s) => s.avg_days_in_stage || 0)
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-8 md:px-12 pt-8 pb-6 border-b border-(--color-surface-4)">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-(--color-blue)/12 text-(--color-blue) flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-(--color-fg)">
                Pipeline Analytics
              </h1>
              <p className="text-sm text-(--color-fg-muted)">
                Stage-by-stage health, conversion, and velocity.
              </p>
            </div>
          </div>

          {/* Pipeline selector */}
          {pipelines.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-(--color-fg-muted) uppercase tracking-wide">
                Pipeline
              </span>
              <select
                value={selectedPipelineId}
                onChange={(e) =>
                  router.push(`/analytics?pipeline=${e.target.value}`)
                }
                className="rounded-lg border border-(--color-surface-4) bg-(--color-surface-1) px-3 py-2 text-sm text-(--color-fg) focus:outline-none focus:ring-2 focus:ring-(--color-blue)"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-8 md:px-12 py-6 space-y-6 max-w-350 w-full mx-auto">
        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Open Deals"
            value={summary.total_open_deals.toLocaleString()}
            sub={`${formatCurrency(summary.total_open_value)} total value`}
            Icon={Workflow}
          />
          <KpiCard
            label="Weighted Value"
            value={formatCurrency(summary.total_weighted_value)}
            sub="Adjusted by stage probability"
            Icon={Wallet}
          />
          <KpiCard
            label="Avg Stage Age"
            value={formatDays(summary.avg_stage_age_days)}
            sub="Time in current stage"
            Icon={Clock}
          />
          <KpiCard
            label="Win Rate"
            value={formatPct(summary.win_rate_pct)}
            sub={`${summary.won_count} won · ${summary.lost_count} lost`}
            Icon={Trophy}
            tone={summary.win_rate_pct >= 50 ? "success" : "default"}
          />
        </div>

        {/* Stage breakdown table */}
        <div className="rounded-2xl border border-(--color-surface-4) bg-(--color-surface-1) overflow-hidden">
          <div className="px-5 py-4 border-b border-(--color-surface-4) flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-(--color-fg-muted)" />
            <h2 className="text-sm font-semibold text-(--color-fg)">
              Stage breakdown
            </h2>
          </div>
          {summary.stages.length === 0 ? (
            <div className="p-8 text-center text-sm text-(--color-fg-muted)">
              No stages in this pipeline yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-(--color-fg-muted) border-b border-(--color-surface-4)">
                    <th className="py-3 px-5 pr-4 font-medium">Stage</th>
                    <th className="py-3 pr-4 font-medium">Deals</th>
                    <th className="py-3 pr-4 font-medium">Value</th>
                    <th className="py-3 pr-4 font-medium">Weighted</th>
                    <th className="py-3 pr-4 font-medium">Avg age</th>
                    <th className="py-3 pr-4 font-medium">Avg time in stage</th>
                    <th className="py-3 pr-5 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.stages.map((s) => (
                    <tr
                      key={s.stage_id}
                      className="border-b border-(--color-surface-4) last:border-0"
                    >
                      <StageRowCells stage={s} maxCount={maxStageCount} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Velocity + Win/Loss row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Stage velocity */}
          <div className="rounded-2xl border border-(--color-surface-4) bg-(--color-surface-1) p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-(--color-fg-muted)" />
              <h2 className="text-sm font-semibold text-(--color-fg)">
                Stage velocity
              </h2>
              <span className="text-xs text-(--color-fg-muted) ml-auto">
                Avg days deals spend in each stage
              </span>
            </div>
            {summary.stages.filter((s) => s.avg_days_in_stage > 0).length === 0 ? (
              <div className="py-8 text-center text-sm text-(--color-fg-muted)">
                Not enough stage transitions yet to measure velocity.
              </div>
            ) : (
              <div className="space-y-3">
                {summary.stages.map((s) => {
                  const width =
                    s.avg_days_in_stage > 0
                      ? (s.avg_days_in_stage / maxVelocity) * 100
                      : 0;
                  return (
                    <div key={s.stage_id} className="flex items-center gap-3">
                      <div className="w-32 truncate text-sm text-(--color-fg)">
                        {s.stage_name}
                      </div>
                      <div className="h-2 flex-1 rounded-full bg-(--color-surface-3) overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            s.is_won
                              ? "bg-(--color-success)"
                              : s.is_lost
                              ? "bg-(--color-danger)"
                              : "bg-(--color-accent)"
                          )}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="w-12 text-right tabular-nums text-sm text-(--color-fg-muted)">
                        {formatDays(s.avg_days_in_stage)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Win / Loss */}
          <div className="rounded-2xl border border-(--color-surface-4) bg-(--color-surface-1) p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-(--color-fg-muted)" />
              <h2 className="text-sm font-semibold text-(--color-fg)">
                Win / Loss
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl bg-(--color-success)/10 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-(--color-success) mb-1">
                  <Trophy className="h-3.5 w-3.5" />
                  Won
                </div>
                <div className="text-xl font-bold text-(--color-fg)">
                  {summary.won_count}
                </div>
                <div className="text-xs text-(--color-fg-muted) mt-0.5">
                  {formatCurrency(summary.won_value)}
                </div>
              </div>
              <div className="rounded-xl bg-(--color-danger)/10 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-(--color-danger) mb-1">
                  <XCircle className="h-3.5 w-3.5" />
                  Lost
                </div>
                <div className="text-xl font-bold text-(--color-fg)">
                  {summary.lost_count}
                </div>
                <div className="text-xs text-(--color-fg-muted) mt-0.5">
                  {formatPct(100 - summary.win_rate_pct)} of closed
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-(--color-fg-muted) mb-2">
                Top loss reasons
              </div>
              {summary.top_loss_reasons.length === 0 ? (
                <div className="text-sm text-(--color-fg-muted) py-2">
                  No losses recorded yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {summary.top_loss_reasons.map((r) => {
                    const pct =
                      summary.lost_count === 0
                        ? 0
                        : (r.count / summary.lost_count) * 100;
                    return (
                      <li key={r.label} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-(--color-fg) truncate">
                          {r.label}
                        </span>
                        <div className="h-1.5 w-24 rounded-full bg-(--color-surface-3) overflow-hidden">
                          <div
                            className="h-full rounded-full bg-(--color-danger)"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums text-xs text-(--color-fg-muted)">
                          {r.count}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper row to avoid nested <tr> from StageRow above.
function StageRowCells({
  stage,
  maxCount,
}: {
  stage: StageBreakdown;
  maxCount: number;
}) {
  const barWidth = maxCount === 0 ? 0 : (stage.count / maxCount) * 100;
  const tone = stage.is_won
    ? "bg-(--color-success)"
    : stage.is_lost
    ? "bg-(--color-danger)"
    : "bg-(--color-accent)";
  return (
    <>
      <td className="py-3 px-5 pr-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", tone)} />
          <span className="font-medium text-(--color-fg)">
            {stage.stage_name}
          </span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-(--color-fg) font-medium w-6 text-right">
            {stage.count}
          </span>
          <div className="h-1.5 flex-1 max-w-30 rounded-full bg-(--color-surface-3) overflow-hidden">
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${barWidth}%` }} />
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 tabular-nums text-(--color-fg)">
        {formatCurrency(stage.total_value)}
      </td>
      <td className="py-3 pr-4 tabular-nums text-(--color-fg-muted)">
        {formatCurrency(stage.weighted_value)}
      </td>
      <td className="py-3 pr-4 tabular-nums text-(--color-fg-muted)">
        {formatDays(stage.avg_age_days)}
      </td>
      <td className="py-3 pr-4 tabular-nums text-(--color-fg-muted)">
        {formatDays(stage.avg_days_in_stage)}
      </td>
      <td className="py-3 pr-5 tabular-nums text-(--color-fg-muted)">
        {formatPct(stage.conversion_pct)}
      </td>
    </>
  );
}
