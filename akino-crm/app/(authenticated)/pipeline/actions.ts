"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Deal, PipelineStage, LossReason, Activity, Pipeline, Lead } from "@/lib/types";

/** Bust cached pipeline data + revalidate the page */
function bustPipelineCache() {
  revalidatePath("/pipeline");
}

// ─── Reads ─────────────────────────────────────────────────────────────

export async function getPipelines(): Promise<Pipeline[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("pipelines")
    .select("*")
    .eq("is_archived", false)
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw error;
  return data as Pipeline[];
}

export async function getStages(pipelineId?: string): Promise<PipelineStage[]> {
  const sb = await createClient();
  if (pipelineId) {
    const { data, error } = await sb
      .from("pipeline_stages")
      .select("*")
      .eq("is_archived", false)
      .eq("pipeline_id", pipelineId)
      .order("position");
    if (error) throw error;
    return data as PipelineStage[];
  }
  // No pipelineId — scope to company's pipelines
  const companyId = await getActiveCompanyId();
  const { data: pipelines } = await sb
    .from("pipelines")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_archived", false);
  const pipelineIds = (pipelines ?? []).map((p) => p.id);
  if (pipelineIds.length === 0) return [];
  const { data, error } = await sb
    .from("pipeline_stages")
    .select("*")
    .in("pipeline_id", pipelineIds)
    .eq("is_archived", false)
    .order("position");
  if (error) throw error;
  return data as PipelineStage[];
}

export async function getDeals(): Promise<Deal[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .eq("company_id", companyId)
    .order("stage_entered_at", { ascending: false });
  if (error) throw error;
  return data as Deal[];
}

export async function getLossReasons(): Promise<LossReason[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("loss_reasons")
    .select("*")
    .eq("is_archived", false)
    .eq("company_id", companyId)
    .order("position");
  if (error) throw error;
  return data as LossReason[];
}

export async function getFolderName(folderId: string): Promise<string> {
  const sb = await createClient();
  const { data } = await sb
    .from("folders")
    .select("name")
    .eq("id", folderId)
    .single();
  return data?.name ?? "Folder";
}

export async function getDealActivities(dealId: string): Promise<Activity[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("activities")
    .select("*")
    .eq("deal_id", dealId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data as Activity[];
}

export type LeadSearchResult = Pick<Lead, "id" | "name" | "company" | "email" | "status" | "quality_rating" | "folder_id">;

export async function searchLeads(opts: {
  query?: string;
  enrichedOnly?: boolean;
}): Promise<LeadSearchResult[]> {
  const sb = await createClient();
  let q = sb
    .from("leads")
    .select("id, name, company, email, status, quality_rating, folder_id")
    .order("name");

  if (opts.query) {
    q = q.or(
      `name.ilike.%${opts.query}%,email.ilike.%${opts.query}%,company.ilike.%${opts.query}%`
    );
  }
  if (opts.enrichedOnly) {
    q = q.eq("status", "enriched");
  }

  const { data, error } = await q.limit(50);
  if (error) throw error;
  return (data ?? []) as LeadSearchResult[];
}

// ─── Mutations ─────────────────────────────────────────────────────────

export async function createDeal(input: {
  contact_name: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  stage_id: string;
  lead_id?: string;
  source_folder_id?: string;
}) {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("deals")
    .insert({
      ...input,
      company_id: companyId,
      owner_id: user.id,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  bustPipelineCache();
  return data as Deal;
}

export async function moveDeal(
  dealId: string,
  newStageId: string,
  options?: { lossReasonId?: string | null }
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // Get old stage name for history
  const { data: deal } = await sb
    .from("deals")
    .select("stage_id")
    .eq("id", dealId)
    .single();
  const oldStageId = deal?.stage_id;

  // Get stage names for activity log
  const { data: stages } = await sb
    .from("pipeline_stages")
    .select("id, name")
    .in("id", [oldStageId, newStageId].filter(Boolean) as string[]);
  const stageMap = Object.fromEntries(
    (stages ?? []).map((s) => [s.id, s.name])
  );

  // Check if won/lost
  const { data: newStage } = await sb
    .from("pipeline_stages")
    .select("is_won, is_lost")
    .eq("id", newStageId)
    .single();

  // Loss reason is REQUIRED when moving to a Lost stage
  if (newStage?.is_lost && !options?.lossReasonId) {
    throw new Error("LOSS_REASON_REQUIRED");
  }

  const updates: Record<string, unknown> = {
    stage_id: newStageId,
    stage_entered_at: new Date().toISOString(),
  };
  if (newStage?.is_won) updates.won_at = new Date().toISOString();
  if (newStage?.is_lost) {
    updates.lost_at = new Date().toISOString();
    updates.loss_reason_id = options?.lossReasonId ?? null;
  }

  const { error } = await sb.from("deals").update(updates).eq("id", dealId);
  if (error) throw error;

  // Log stage history
  await sb.from("deal_stage_history").insert({
    deal_id: dealId,
    from_stage_id: oldStageId,
    to_stage_id: newStageId,
    changed_by: user?.id ?? null,
  });

  // Log activity
  await sb.from("activities").insert({
    deal_id: dealId,
    type: newStage?.is_won ? "won" : newStage?.is_lost ? "lost" : "stage_change",
    summary: `Moved from ${stageMap[oldStageId!] ?? "—"} to ${stageMap[newStageId] ?? "—"}`,
    stage_from: stageMap[oldStageId!] ?? null,
    stage_to: stageMap[newStageId] ?? null,
    created_by: user?.id ?? null,
  });

  bustPipelineCache();
}

export async function logActivity(input: {
  deal_id: string;
  type: Activity["type"];
  summary?: string;
  notes?: string;
  call_direction?: Activity["call_direction"];
  call_duration_seconds?: number;
  call_outcome?: string;
  email_subject?: string;
  /**
   * When set, the activity is recorded as scheduled (future-dated) rather
   * than logged as already-done. Pair with status="scheduled".
   */
  scheduled_at?: string | null;
  status?: Activity["status"];
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const scheduled = input.status === "scheduled";
  const { error } = await sb.from("activities").insert({
    ...input,
    status: input.status ?? "done",
    // For scheduled activities we set occurred_at to the scheduled time so
    // it can appear on timelines in the correct relative position.
    occurred_at: scheduled && input.scheduled_at ? input.scheduled_at : undefined,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
  bustPipelineCache();
}

/**
 * Mark a previously-scheduled activity as completed. Flips status to "done"
 * and stamps occurred_at to now so it lands at the top of the timeline.
 */
export async function completeScheduledActivity(id: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("activities")
    .update({ status: "done", occurred_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  bustPipelineCache();
}

export async function setFollowUp(
  dealId: string,
  followUpAt: string,
  note?: string
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const { error } = await sb
    .from("deals")
    .update({
      follow_up_at: followUpAt,
      follow_up_note: note ?? null,
    })
    .eq("id", dealId);
  if (error) throw error;

  await sb.from("activities").insert({
    deal_id: dealId,
    type: "follow_up_set",
    summary: `Follow-up set for ${new Date(followUpAt).toLocaleDateString()}`,
    notes: note ?? null,
    created_by: user?.id ?? null,
  });

  bustPipelineCache();
}

export async function markDealLost(dealId: string, lossReasonId: string) {
  const sb = await createClient();

  // Find the Lost stage
  const { data: lostStage } = await sb
    .from("pipeline_stages")
    .select("id")
    .eq("is_lost", true)
    .single();
  if (!lostStage) throw new Error("No Lost stage configured");

  const { error } = await sb
    .from("deals")
    .update({
      stage_id: lostStage.id,
      lost_at: new Date().toISOString(),
      loss_reason_id: lossReasonId,
    })
    .eq("id", dealId);
  if (error) throw error;

  bustPipelineCache();
}

export async function deleteDeal(dealId: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { error } = await sb
    .from("deals")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq("id", dealId);
  if (error) throw error;
  bustPipelineCache();
  revalidatePath("/trash");
}

export async function updateDeal(
  dealId: string,
  updates: Partial<Pick<Deal, "contact_name" | "company" | "email" | "phone" | "linkedin_url" | "notes" | "deal_value">>
) {
  const sb = await createClient();
  const { error } = await sb.from("deals").update(updates).eq("id", dealId);
  if (error) throw error;
  bustPipelineCache();
}

// ─── Stage CRUD ────────────────────────────────────────────────────────

export async function createStage(name: string, pipelineId?: string) {
  const sb = await createClient();
  // Find the current max position among non-terminal stages
  let q = sb
    .from("pipeline_stages")
    .select("position")
    .eq("is_archived", false)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: false })
    .limit(1);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { data: existing } = await q;

  const maxPos = existing?.[0]?.position ?? 0;

  // Shift Won/Lost stages up by 1 to make room
  try { await sb.rpc("shift_terminal_stages", { new_start: maxPos + 2 }); } catch { /* Fallback if RPC doesn't exist: manual shift */ }

  // Also manually shift won/lost positions
  const { data: terminals } = await sb
    .from("pipeline_stages")
    .select("id, position, is_won, is_lost")
    .eq("is_archived", false)
    .or("is_won.eq.true,is_lost.eq.true")
    .order("position");

  if (terminals && terminals.length > 0) {
    for (const t of terminals) {
      if (t.position <= maxPos + 1) {
        await sb
          .from("pipeline_stages")
          .update({ position: t.position + 1 })
          .eq("id", t.id);
      }
    }
  }

  const insertData: Record<string, unknown> = { name, position: maxPos + 1 };
  if (pipelineId) insertData.pipeline_id = pipelineId;
  const { data, error } = await sb
    .from("pipeline_stages")
    .insert(insertData)
    .select()
    .single();
  if (error) throw error;
  bustPipelineCache();
  return data as PipelineStage;
}

export async function updateStage(
  stageId: string,
  updates: { name?: string }
) {
  const sb = await createClient();
  const { error } = await sb
    .from("pipeline_stages")
    .update(updates)
    .eq("id", stageId);
  if (error) throw error;
  bustPipelineCache();
}

export async function deleteStage(stageId: string) {
  const sb = await createClient();

  // Check if stage has deals
  const { count } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId);

  if (count && count > 0) {
    throw new Error("Cannot delete a stage that has deals. Move or delete deals first.");
  }

  const { error } = await sb
    .from("pipeline_stages")
    .update({ is_archived: true })
    .eq("id", stageId);
  if (error) throw error;
  bustPipelineCache();
}

export async function reorderStages(orderedIds: string[]) {
  const sb = await createClient();
  const updates = orderedIds.map((id, i) =>
    sb.from("pipeline_stages").update({ position: i }).eq("id", id)
  );
  await Promise.all(updates);
  bustPipelineCache();
}

// ─── Pipeline CRUD ─────────────────────────────────────────────────────

export async function createPipeline(name: string): Promise<Pipeline> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("pipelines")
    .insert({ name, company_id: companyId, created_by: user.id })
    .select()
    .single();
  if (error) throw error;

  // Create default stages for the new pipeline
  const defaultStages = [
    { name: "Lead", position: 0, pipeline_id: data.id },
    { name: "Qualified", position: 1, pipeline_id: data.id },
    { name: "Proposal", position: 2, pipeline_id: data.id },
    { name: "Won", position: 3, pipeline_id: data.id, is_won: true },
    { name: "Lost", position: 4, pipeline_id: data.id, is_lost: true },
  ];
  await sb.from("pipeline_stages").insert(defaultStages);

  bustPipelineCache();
  return data as Pipeline;
}

export async function renamePipeline(pipelineId: string, name: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("pipelines")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", pipelineId);
  if (error) throw error;
  bustPipelineCache();
}

export async function deletePipeline(pipelineId: string) {
  const sb = await createClient();

  // Prevent deleting default pipeline
  const { data: pipeline } = await sb
    .from("pipelines")
    .select("is_default")
    .eq("id", pipelineId)
    .single();
  if (pipeline?.is_default) throw new Error("Cannot delete the default pipeline");

  const { error } = await sb
    .from("pipelines")
    .update({ is_archived: true })
    .eq("id", pipelineId);
  if (error) throw error;
  bustPipelineCache();
}

// ─── Folder-grouped pipeline queries ───────────────────────────────────

export type FolderPipelineGroup = {
  folder_id: string;
  folder_name: string;
  pipelines: (Pipeline & { deal_count: number })[];
};

export async function getPipelinesGroupedByFolder(): Promise<FolderPipelineGroup[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data: pipelinesRaw, error } = await sb
    .from("pipelines")
    .select("*")
    .eq("is_archived", false)
    .eq("company_id", companyId)
    .not("folder_id", "is", null)
    .order("created_at");
  if (error) throw error;

  const pipelines = pipelinesRaw as Pipeline[];
  if (pipelines.length === 0) return [];

  // Get unique folder IDs
  const folderIds = [...new Set(pipelines.map((p) => p.folder_id!))];
  const { data: folders } = await sb
    .from("folders")
    .select("id, name")
    .in("id", folderIds);
  const folderMap = new Map((folders ?? []).map((f) => [f.id, f.name]));

  // Get deal counts per pipeline via stages
  const pipelinesWithCounts: (Pipeline & { deal_count: number })[] = [];
  for (const p of pipelines) {
    const { data: stageIds } = await sb
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", p.id)
      .eq("is_archived", false);
    const sIds = (stageIds ?? []).map((s) => s.id);
    let dealCount = 0;
    if (sIds.length > 0) {
      const { count } = await sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .in("stage_id", sIds);
      dealCount = count ?? 0;
    }
    pipelinesWithCounts.push({ ...p, deal_count: dealCount });
  }

  // Group by folder
  const groups: FolderPipelineGroup[] = [];
  for (const folderId of folderIds) {
    groups.push({
      folder_id: folderId,
      folder_name: folderMap.get(folderId) ?? "Unknown Folder",
      pipelines: pipelinesWithCounts.filter((p) => p.folder_id === folderId),
    });
  }

  return groups;
}

export async function getDealsForFolder(folderId: string): Promise<Deal[]> {
  const sb = await createClient();
  // Get all pipelines under this folder
  const { data: pipelinesRaw } = await sb
    .from("pipelines")
    .select("id")
    .eq("folder_id", folderId)
    .eq("is_archived", false);
  const pipelineIds = (pipelinesRaw ?? []).map((p) => p.id);
  if (pipelineIds.length === 0) return [];

  // Get all stages for these pipelines
  const { data: stagesRaw } = await sb
    .from("pipeline_stages")
    .select("id")
    .in("pipeline_id", pipelineIds)
    .eq("is_archived", false);
  const stageIds = (stagesRaw ?? []).map((s) => s.id);
  if (stageIds.length === 0) return [];

  const { data, error } = await sb
    .from("deals")
    .select("*")
    .in("stage_id", stageIds)
    .order("stage_entered_at", { ascending: false });
  if (error) throw error;
  return data as Deal[];
}

export async function getStagesForFolder(folderId: string): Promise<PipelineStage[]> {
  const sb = await createClient();
  // Get any pipeline under this folder and use its stages as the shared template
  const { data: pipelinesRaw } = await sb
    .from("pipelines")
    .select("id")
    .eq("folder_id", folderId)
    .eq("is_archived", false)
    .limit(1);
  if (!pipelinesRaw || pipelinesRaw.length === 0) return [];

  const { data, error } = await sb
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelinesRaw[0].id)
    .eq("is_archived", false)
    .order("position");
  if (error) throw error;
  return data as PipelineStage[];
}

export async function createPipelineForBatch(
  folderId: string,
  batchId: string,
  batchName: string
): Promise<Pipeline> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if folder already has a pipeline (to copy stages from)
  const { data: existingPipelines } = await sb
    .from("pipelines")
    .select("id")
    .eq("folder_id", folderId)
    .eq("is_archived", false)
    .limit(1);

  const { data: pipeline, error } = await sb
    .from("pipelines")
    .insert({
      name: batchName,
      folder_id: folderId,
      batch_id: batchId,
      company_id: await getActiveCompanyId(),
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  if (existingPipelines && existingPipelines.length > 0) {
    // Copy stages from existing folder pipeline
    const { data: templateStages } = await sb
      .from("pipeline_stages")
      .select("name, position, is_won, is_lost")
      .eq("pipeline_id", existingPipelines[0].id)
      .eq("is_archived", false)
      .order("position");

    if (templateStages && templateStages.length > 0) {
      await sb.from("pipeline_stages").insert(
        templateStages.map((s) => ({
          ...s,
          pipeline_id: pipeline.id,
        }))
      );
    }
  } else {
    // First pipeline for this folder — create default stages
    const defaultStages = [
      { name: "Lead", position: 0, pipeline_id: pipeline.id },
      { name: "Contacted", position: 1, pipeline_id: pipeline.id },
      { name: "Qualified", position: 2, pipeline_id: pipeline.id },
      { name: "Proposal", position: 3, pipeline_id: pipeline.id },
      { name: "Won", position: 4, pipeline_id: pipeline.id, is_won: true },
      { name: "Lost", position: 5, pipeline_id: pipeline.id, is_lost: true },
    ];
    await sb.from("pipeline_stages").insert(defaultStages);
  }

  bustPipelineCache();
  return pipeline as Pipeline;
}
