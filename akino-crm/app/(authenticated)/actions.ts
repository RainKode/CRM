"use server";

import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Deal, PipelineStage, Activity, Notification, Task } from "@/lib/types";

export async function getDashboardData() {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  // Get company pipelines first, then stages for those pipelines
  const { data: companyPipelines } = await sb
    .from("pipelines")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_archived", false);
  const pipelineIds = (companyPipelines ?? []).map((p) => p.id);

  const [
    { data: stages },
    { data: deals },
    { data: activities },
    { data: folders },
    { data: notifications },
  ] = await Promise.all([
    pipelineIds.length > 0
      ? sb
          .from("pipeline_stages")
          .select("*")
          .in("pipeline_id", pipelineIds)
          .eq("is_archived", false)
          .order("position")
      : Promise.resolve({ data: [] as PipelineStage[] }),
    sb.from("deals").select("*").eq("company_id", companyId).is("won_at", null).is("lost_at", null),
    sb
      .from("activities")
      .select("*, deals!inner(company_id)")
      .eq("deals.company_id", companyId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    sb.from("folders").select("id, name, is_archived").eq("company_id", companyId),
    sb
      .from("notifications")
      .select("*")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Follow-ups due
  const now = new Date().toISOString();
  const { data: followUps } = await sb
    .from("deals")
    .select("*")
    .eq("company_id", companyId)
    .not("follow_up_at", "is", null)
    .lte("follow_up_at", now)
    .is("won_at", null)
    .is("lost_at", null)
    .order("follow_up_at");

  // Upcoming follow-ups (next 7 days, not yet due)
  const in7days = new Date();
  in7days.setDate(in7days.getDate() + 7);
  const { data: upcoming } = await sb
    .from("deals")
    .select("*")
    .eq("company_id", companyId)
    .gt("follow_up_at", now)
    .lte("follow_up_at", in7days.toISOString())
    .is("won_at", null)
    .is("lost_at", null)
    .order("follow_up_at")
    .limit(10);

  // Tasks: open tasks sorted by due date (overdue first).
  const { data: openTasks } = await sb
    .from("tasks")
    .select("*")
    .eq("company_id", companyId)
    .is("completed_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(10);

  // Queue count: everything due today (tasks + scheduled activities + deal follow-ups).
  const endOfTodayIso = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();
  const [{ count: queueTasks }, { count: queueScheduled }, { count: queueFollowUps }] =
    await Promise.all([
      sb
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("completed_at", null)
        .not("due_at", "is", null)
        .lte("due_at", endOfTodayIso),
      sb
        .from("activities")
        .select("id,deal:deals!inner(company_id)", { count: "exact", head: true })
        .eq("deal.company_id", companyId)
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", endOfTodayIso),
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("won_at", null)
        .is("lost_at", null)
        .not("follow_up_at", "is", null)
        .lte("follow_up_at", endOfTodayIso),
    ]);
  const queueCount =
    (queueTasks ?? 0) + (queueScheduled ?? 0) + (queueFollowUps ?? 0);

  // Stage counts
  const stageCounts: Record<string, number> = {};
  for (const d of (deals ?? []) as Deal[]) {
    stageCounts[d.stage_id] = (stageCounts[d.stage_id] ?? 0) + 1;
  }

  // Folder lead counts
  const folderIds = (folders ?? []).filter((f) => !f.is_archived).map((f) => f.id);
  const folderStats: { id: string; name: string; total: number; enriched: number }[] = [];
  for (const f of (folders ?? []).filter((f) => !f.is_archived)) {
    const { count: total } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", f.id);
    const { count: enriched } = await sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", f.id)
      .eq("status", "enriched");
    folderStats.push({
      id: f.id,
      name: f.name,
      total: total ?? 0,
      enriched: enriched ?? 0,
    });
  }

  return {
    stages: (stages ?? []) as PipelineStage[],
    stageCounts,
    followUps: (followUps ?? []) as Deal[],
    upcomingFollowUps: (upcoming ?? []) as Deal[],
    recentActivities: (activities ?? []) as Activity[],
    folderStats,
    notifications: (notifications ?? []) as Notification[],
    openTasks: (openTasks ?? []) as Task[],
    queueCount,
  };
}
