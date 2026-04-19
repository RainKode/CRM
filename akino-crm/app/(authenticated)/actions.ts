"use server";

import { createClient } from "@/lib/supabase/server";
import type { Deal, PipelineStage, Activity, Notification } from "@/lib/types";

export async function getDashboardData() {
  const sb = await createClient();

  const [
    { data: stages },
    { data: deals },
    { data: activities },
    { data: folders },
    { data: notifications },
  ] = await Promise.all([
    sb
      .from("pipeline_stages")
      .select("*")
      .eq("is_archived", false)
      .order("position"),
    sb.from("deals").select("*").is("won_at", null).is("lost_at", null),
    sb
      .from("activities")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(20),
    sb.from("folders").select("id, name, is_archived"),
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
    .not("follow_up_at", "is", null)
    .lte("follow_up_at", now)
    .is("won_at", null)
    .is("lost_at", null)
    .order("follow_up_at");

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
    recentActivities: (activities ?? []) as Activity[],
    folderStats,
    notifications: (notifications ?? []) as Notification[],
  };
}
