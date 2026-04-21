"use server";

import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Pipeline, PipelineStage } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────

export type StageBreakdown = {
  stage_id: string;
  stage_name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  count: number;            // open deals currently in stage
  total_value: number;      // sum of deal_value in stage (numeric)
  weighted_value: number;   // total_value * stage probability (proxy: position / total_open_stages)
  avg_age_days: number;     // avg days since stage_entered_at for deals currently in stage
  ever_entered: number;     // deals that ever entered this stage (for conversion)
  conversion_pct: number;   // ever_entered / first_stage_entered * 100
  avg_days_in_stage: number;// avg time a deal spends in this stage before leaving (from history)
};

export type AnalyticsSummary = {
  pipeline_id: string;
  pipeline_name: string;
  total_open_deals: number;
  total_open_value: number;
  total_weighted_value: number;
  avg_stage_age_days: number;  // avg across all open deals of (now - stage_entered_at)
  won_count: number;
  lost_count: number;
  win_rate_pct: number;        // won / (won + lost)
  won_value: number;
  stages: StageBreakdown[];
  top_loss_reasons: { label: string; count: number }[];
};

// ─── Reads ─────────────────────────────────────────────────────────────

export async function getPipelinesForAnalytics(): Promise<Pipeline[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("pipelines")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_archived", false)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Pipeline[];
}

/**
 * Compute every analytics metric for a single pipeline in one round-trip
 * (stages, deals, deal_stage_history, loss reasons). Kept intentionally
 * simple — this is Slice 7's "first-pass numbers", not a BI surface.
 */
export async function getAnalytics(pipelineId: string): Promise<AnalyticsSummary> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  // Pipeline metadata + stages (scoped to pipeline).
  const [pipelineRes, stagesRes] = await Promise.all([
    sb
      .from("pipelines")
      .select("id,name,company_id")
      .eq("id", pipelineId)
      .single(),
    sb
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .eq("is_archived", false)
      .order("position"),
  ]);
  if (pipelineRes.error) throw new Error(pipelineRes.error.message);
  if (stagesRes.error) throw new Error(stagesRes.error.message);

  const pipeline = pipelineRes.data as Pipeline;
  if (pipeline.company_id !== companyId) {
    throw new Error("Pipeline not in active company");
  }
  const stages = (stagesRes.data ?? []) as PipelineStage[];
  const stageIds = stages.map((s) => s.id);
  if (stageIds.length === 0) {
    return {
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      total_open_deals: 0,
      total_open_value: 0,
      total_weighted_value: 0,
      avg_stage_age_days: 0,
      won_count: 0,
      lost_count: 0,
      win_rate_pct: 0,
      won_value: 0,
      stages: [],
      top_loss_reasons: [],
    };
  }

  // Deals in this pipeline (all — open/won/lost), plus stage history + loss reasons.
  const [dealsRes, historyRes, lossRes] = await Promise.all([
    sb
      .from("deals")
      .select(
        "id,stage_id,deal_value,stage_entered_at,won_at,lost_at,loss_reason_id"
      )
      .eq("company_id", companyId)
      .in("stage_id", stageIds),
    sb
      .from("deal_stage_history")
      .select("deal_id,from_stage_id,to_stage_id,changed_at")
      .in("to_stage_id", stageIds)
      .order("changed_at", { ascending: true }),
    sb
      .from("loss_reasons")
      .select("id,label")
      .eq("company_id", companyId),
  ]);
  if (dealsRes.error) throw new Error(dealsRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);
  if (lossRes.error) throw new Error(lossRes.error.message);

  const deals = dealsRes.data ?? [];
  const history = historyRes.data ?? [];
  const lossMap = new Map<string, string>(
    (lossRes.data ?? []).map((r) => [r.id, r.label])
  );

  const now = Date.now();
  const DAY_MS = 1000 * 60 * 60 * 24;

  // ── Open deal metrics ────────────────────────────────────────────
  const openDeals = deals.filter((d) => !d.won_at && !d.lost_at);
  const wonDeals = deals.filter((d) => d.won_at);
  const lostDeals = deals.filter((d) => d.lost_at);

  const total_open_deals = openDeals.length;
  const total_open_value = openDeals.reduce(
    (sum, d) => sum + Number(d.deal_value ?? 0),
    0
  );
  const won_value = wonDeals.reduce(
    (sum, d) => sum + Number(d.deal_value ?? 0),
    0
  );

  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const openStageCount = Math.max(openStages.length, 1);
  // Probability proxy: (position_index + 1) / openStageCount for open stages,
  // 1.0 for won, 0 for lost. Open stages are ordered by position already.
  const probForStage = new Map<string, number>();
  openStages.forEach((s, i) => {
    probForStage.set(s.id, (i + 1) / openStageCount);
  });
  for (const s of stages) {
    if (s.is_won) probForStage.set(s.id, 1);
    if (s.is_lost) probForStage.set(s.id, 0);
  }

  const total_weighted_value = openDeals.reduce((sum, d) => {
    const p = probForStage.get(d.stage_id) ?? 0;
    return sum + Number(d.deal_value ?? 0) * p;
  }, 0);

  const avg_stage_age_days =
    openDeals.length === 0
      ? 0
      : openDeals.reduce(
          (sum, d) =>
            sum + (now - new Date(d.stage_entered_at).getTime()) / DAY_MS,
          0
        ) / openDeals.length;

  const won_count = wonDeals.length;
  const lost_count = lostDeals.length;
  const decided = won_count + lost_count;
  const win_rate_pct = decided === 0 ? 0 : (won_count / decided) * 100;

  // ── Per-stage breakdown ──────────────────────────────────────────
  // Group history by (deal, stage) to compute time-in-stage for stages
  // the deal has since left. We walk each deal's history ordered by time
  // and for every transition, record (deal, from_stage, duration).
  const historyByDeal = new Map<string, typeof history>();
  for (const row of history) {
    const arr = historyByDeal.get(row.deal_id);
    if (arr) arr.push(row);
    else historyByDeal.set(row.deal_id, [row]);
  }

  // stageDurations: stage_id -> list of durations (days) deals spent in it
  const stageDurations = new Map<string, number[]>();
  // stageEverEntered: stage_id -> distinct deal count that ever hit it
  const stageEverEntered = new Map<string, Set<string>>();
  for (const s of stages) {
    stageDurations.set(s.id, []);
    stageEverEntered.set(s.id, new Set());
  }

  for (const [dealId, rows] of historyByDeal) {
    for (let i = 0; i < rows.length; i++) {
      const to = rows[i].to_stage_id;
      stageEverEntered.get(to)?.add(dealId);
      // Duration in `to` stage = time until next transition, if any.
      const enteredAt = new Date(rows[i].changed_at).getTime();
      const leftAt =
        i + 1 < rows.length ? new Date(rows[i + 1].changed_at).getTime() : null;
      if (leftAt !== null) {
        stageDurations.get(to)?.push((leftAt - enteredAt) / DAY_MS);
      }
    }
  }

  // Fall back to `stage_entered_at` on the deal itself for stages with no
  // history rows yet (deals created before history tracking existed).
  for (const d of deals) {
    stageEverEntered.get(d.stage_id)?.add(d.id);
  }

  // Conversion % uses the first open stage as the "100%" cohort baseline.
  const firstOpenStage = openStages[0];
  const cohortBase = firstOpenStage
    ? stageEverEntered.get(firstOpenStage.id)?.size ?? 0
    : 0;

  // Per-stage counts + values for currently-in-stage deals.
  const countByStage = new Map<string, number>();
  const valueByStage = new Map<string, number>();
  const ageByStage = new Map<string, number[]>();
  for (const d of openDeals) {
    countByStage.set(d.stage_id, (countByStage.get(d.stage_id) ?? 0) + 1);
    valueByStage.set(
      d.stage_id,
      (valueByStage.get(d.stage_id) ?? 0) + Number(d.deal_value ?? 0)
    );
    const ages = ageByStage.get(d.stage_id) ?? [];
    ages.push((now - new Date(d.stage_entered_at).getTime()) / DAY_MS);
    ageByStage.set(d.stage_id, ages);
  }

  const stageBreakdown: StageBreakdown[] = stages.map((s) => {
    const count = countByStage.get(s.id) ?? 0;
    const total_value = valueByStage.get(s.id) ?? 0;
    const prob = probForStage.get(s.id) ?? 0;
    const ages = ageByStage.get(s.id) ?? [];
    const avg_age_days =
      ages.length === 0 ? 0 : ages.reduce((a, b) => a + b, 0) / ages.length;
    const durations = stageDurations.get(s.id) ?? [];
    const avg_days_in_stage =
      durations.length === 0
        ? 0
        : durations.reduce((a, b) => a + b, 0) / durations.length;
    const ever = stageEverEntered.get(s.id)?.size ?? 0;
    const conversion_pct = cohortBase === 0 ? 0 : (ever / cohortBase) * 100;

    return {
      stage_id: s.id,
      stage_name: s.name,
      position: s.position,
      is_won: s.is_won,
      is_lost: s.is_lost,
      count,
      total_value,
      weighted_value: total_value * prob,
      avg_age_days,
      ever_entered: ever,
      conversion_pct,
      avg_days_in_stage,
    };
  });

  // ── Top loss reasons (top 5) ─────────────────────────────────────
  const lossCounts = new Map<string, number>();
  for (const d of lostDeals) {
    if (!d.loss_reason_id) continue;
    lossCounts.set(
      d.loss_reason_id,
      (lossCounts.get(d.loss_reason_id) ?? 0) + 1
    );
  }
  const top_loss_reasons = Array.from(lossCounts.entries())
    .map(([id, count]) => ({ label: lossMap.get(id) ?? "Unknown", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    total_open_deals,
    total_open_value,
    total_weighted_value,
    avg_stage_age_days,
    won_count,
    lost_count,
    win_rate_pct,
    won_value,
    stages: stageBreakdown,
    top_loss_reasons,
  };
}
