"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Batch, BatchLead, Lead, FieldDefinition } from "@/lib/types";

export async function getBatches(folderId?: string): Promise<(Batch & { total: number; completed: number })[]> {
  const sb = await createClient();

  let q = sb.from("batches").select("*").order("created_at", { ascending: false });
  if (folderId) q = q.eq("folder_id", folderId);

  const { data, error } = await q;
  if (error) throw error;
  const batches = data as Batch[];

  // Attach counts
  const result: (Batch & { total: number; completed: number })[] = [];
  for (const b of batches) {
    const { count: total } = await sb
      .from("batch_leads")
      .select("batch_id", { count: "exact", head: true })
      .eq("batch_id", b.id);
    const { count: completed } = await sb
      .from("batch_leads")
      .select("batch_id", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .eq("is_completed", true);
    result.push({ ...b, total: total ?? 0, completed: completed ?? 0 });
  }

  return result;
}

export async function createBatch(input: {
  folder_id: string;
  name: string;
  description?: string;
  lead_ids: string[];
  assignee_id?: string;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: batch, error } = await sb
    .from("batches")
    .insert({
      folder_id: input.folder_id,
      name: input.name,
      description: input.description ?? null,
      assignee_id: input.assignee_id ?? null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert batch_leads
  if (input.lead_ids.length > 0) {
    const { error: blErr } = await sb.from("batch_leads").insert(
      input.lead_ids.map((lid) => ({
        batch_id: batch.id,
        lead_id: lid,
      }))
    );
    if (blErr) throw blErr;
  }

  revalidatePath("/enrichment");
  return batch as Batch;
}

export async function getBatchLeads(
  batchId: string
): Promise<(BatchLead & { lead: Lead })[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("batch_leads")
    .select("*, lead:leads(*)")
    .eq("batch_id", batchId)
    .order("added_at");
  if (error) throw error;
  return data as (BatchLead & { lead: Lead })[];
}

export async function completeBatchLead(
  batchId: string,
  leadId: string,
  enrichmentData: Record<string, unknown>
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // Update lead data
  const { data: lead } = await sb
    .from("leads")
    .select("data, folder_id")
    .eq("id", leadId)
    .single();

  if (lead) {
    await sb
      .from("leads")
      .update({
        data: { ...lead.data, ...enrichmentData },
        status: "enriched",
        enriched_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  }

  // Mark batch_lead as completed
  await sb
    .from("batch_leads")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      completed_by: user?.id ?? null,
    })
    .eq("batch_id", batchId)
    .eq("lead_id", leadId);

  // Check if all leads in batch are done
  const { count: remaining } = await sb
    .from("batch_leads")
    .select("batch_id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("is_completed", false);

  if (remaining === 0) {
    await sb
      .from("batches")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", batchId);
  } else {
    await sb
      .from("batches")
      .update({ status: "in_progress" })
      .eq("id", batchId);
  }

  revalidatePath("/enrichment");
}

export async function skipBatchLead(batchId: string, leadId: string) {
  const sb = await createClient();
  await sb
    .from("batch_leads")
    .update({ is_skipped: true })
    .eq("batch_id", batchId)
    .eq("lead_id", leadId);
  revalidatePath("/enrichment");
}

export async function flagBatchLead(
  batchId: string,
  leadId: string,
  reason: string
) {
  const sb = await createClient();
  await sb
    .from("batch_leads")
    .update({ is_flagged: true, flag_reason: reason })
    .eq("batch_id", batchId)
    .eq("lead_id", leadId);
  revalidatePath("/enrichment");
}

export async function getEnrichmentFields(
  folderId: string
): Promise<FieldDefinition[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("field_definitions")
    .select("*")
    .eq("folder_id", folderId)
    .eq("is_enrichment", true)
    .order("position");
  if (error) throw error;
  return data as FieldDefinition[];
}
