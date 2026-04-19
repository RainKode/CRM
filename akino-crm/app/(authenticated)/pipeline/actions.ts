"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Deal, PipelineStage, LossReason, Activity } from "@/lib/types";

// ─── Reads ─────────────────────────────────────────────────────────────

export async function getStages(): Promise<PipelineStage[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("pipeline_stages")
    .select("*")
    .eq("is_archived", false)
    .order("position");
  if (error) throw error;
  return data as PipelineStage[];
}

export async function getDeals(): Promise<Deal[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("deals")
    .select("*")
    .order("stage_entered_at", { ascending: false });
  if (error) throw error;
  return data as Deal[];
}

export async function getLossReasons(): Promise<LossReason[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("loss_reasons")
    .select("*")
    .eq("is_archived", false)
    .order("position");
  if (error) throw error;
  return data as LossReason[];
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
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("deals")
    .insert({
      ...input,
      owner_id: user.id,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/pipeline");
  return data as Deal;
}

export async function moveDeal(dealId: string, newStageId: string) {
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

  const updates: Record<string, unknown> = {
    stage_id: newStageId,
    stage_entered_at: new Date().toISOString(),
  };
  if (newStage?.is_won) updates.won_at = new Date().toISOString();
  if (newStage?.is_lost) updates.lost_at = new Date().toISOString();

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

  revalidatePath("/pipeline");
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
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const { error } = await sb.from("activities").insert({
    ...input,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
  revalidatePath("/pipeline");
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

  revalidatePath("/pipeline");
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

  revalidatePath("/pipeline");
}

export async function updateDeal(
  dealId: string,
  updates: Partial<Pick<Deal, "contact_name" | "company" | "email" | "phone" | "linkedin_url" | "notes">>
) {
  const sb = await createClient();
  const { error } = await sb.from("deals").update(updates).eq("id", dealId);
  if (error) throw error;
  revalidatePath("/pipeline");
}

// ─── Stage CRUD ────────────────────────────────────────────────────────

export async function createStage(name: string) {
  const sb = await createClient();
  // Find the current max position among non-terminal stages
  const { data: existing } = await sb
    .from("pipeline_stages")
    .select("position")
    .eq("is_archived", false)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: false })
    .limit(1);

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

  const { data, error } = await sb
    .from("pipeline_stages")
    .insert({ name, position: maxPos + 1 })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/pipeline");
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
  revalidatePath("/pipeline");
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
  revalidatePath("/pipeline");
}

export async function reorderStages(orderedIds: string[]) {
  const sb = await createClient();
  const updates = orderedIds.map((id, i) =>
    sb.from("pipeline_stages").update({ position: i }).eq("id", id)
  );
  await Promise.all(updates);
  revalidatePath("/pipeline");
}
