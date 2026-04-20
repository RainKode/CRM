"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Batch, BatchLead, Lead, FieldDefinition } from "@/lib/types";
import { createPipelineForBatch } from "@/app/(authenticated)/pipeline/actions";

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

export async function createBatchFromFolder(folderId: string, name: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get all lead IDs from the folder
  const { data: leads, error: leadsErr } = await sb
    .from("leads")
    .select("id")
    .eq("folder_id", folderId);
  if (leadsErr) throw leadsErr;

  const lead_ids = (leads ?? []).map((l) => l.id);

  return createBatch({
    folder_id: folderId,
    name,
    lead_ids,
  });
}

export async function createMultipleBatches(input: {
  folder_id: string;
  name_prefix: string;
  lead_ids: string[];
  batch_size: number;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { lead_ids, batch_size, name_prefix, folder_id } = input;
  const totalBatches = Math.ceil(lead_ids.length / batch_size);
  const created: Batch[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const chunk = lead_ids.slice(i * batch_size, (i + 1) * batch_size);
    const batchName = `${name_prefix} - Batch #${i + 1}`;

    const { data: batch, error } = await sb
      .from("batches")
      .insert({
        folder_id,
        name: batchName,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    // Insert batch_leads in chunks of 500
    for (let j = 0; j < chunk.length; j += 500) {
      const slice = chunk.slice(j, j + 500);
      const { error: blErr } = await sb.from("batch_leads").insert(
        slice.map((lid) => ({ batch_id: batch.id, lead_id: lid }))
      );
      if (blErr) throw blErr;
    }

    created.push(batch as Batch);

    // Auto-create a pipeline for this batch
    try {
      await createPipelineForBatch(folder_id, batch.id, batchName);
    } catch {
      // Non-fatal: pipeline creation failure shouldn't block batch creation
      console.error(`Failed to auto-create pipeline for batch ${batch.id}`);
    }
  }

  revalidatePath("/enrichment");
  return created;
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
    .select("data, folder_id, name, company, email")
    .eq("id", leadId)
    .single();

  // Merge enrichment into the data JSON
  const mergedData = { ...lead?.data, ...enrichmentData };

  // Helper: extract a string field from merged data (case-insensitive)
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const val = mergedData[k] ?? mergedData[k.toLowerCase()] ?? mergedData[k.charAt(0).toUpperCase() + k.slice(1)];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return null;
  };

  // Extract key fields from enrichment data into top-level lead columns
  const extractedEmail = pick("email", "Email") ?? lead?.email ?? null;
  const extractedCompany = pick("company", "Company", "company_name") ?? lead?.company ?? null;

  if (lead) {
    await sb
      .from("leads")
      .update({
        data: mergedData,
        email: extractedEmail,
        company: extractedCompany,
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

  // Auto-create deal in the batch's pipeline
  try {
    // Find the pipeline linked to this batch
    const { data: pipeline } = await sb
      .from("pipelines")
      .select("id")
      .eq("batch_id", batchId)
      .eq("is_archived", false)
      .single();

    if (pipeline) {
      // Get first stage (lowest position) for this pipeline
      const { data: firstStage } = await sb
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .limit(1)
        .single();

      if (firstStage) {
        // Check if a deal already exists for this lead (unique constraint on active lead)
        const { count: existingDeals } = await sb
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", leadId)
          .is("won_at", null)
          .is("lost_at", null);

        if ((existingDeals ?? 0) === 0) {
          await sb.from("deals").insert({
            lead_id: leadId,
            source_folder_id: lead?.folder_id ?? null,
            stage_id: firstStage.id,
            owner_id: user?.id ?? null,
            contact_name: lead?.name || extractedEmail || "Unknown",
            company: extractedCompany,
            email: extractedEmail,
            phone: pick("phone", "Phone") ?? null,
            linkedin_url: pick("linkedin_url", "LinkedIn", "linkedin") ?? null,
            website: pick("website", "Website", "url") ?? null,
            decision_maker: pick("decision_maker", "Decision Maker", "decision_maker_name", "contact_person") ?? null,
            created_by: user?.id ?? null,
          });
        }
      }
    }
  } catch {
    // Non-fatal: don't block enrichment if deal creation fails
    console.error("Auto-create deal failed for lead", leadId);
  }

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
  revalidatePath("/pipeline");
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

export async function unflagBatchLead(batchId: string, leadId: string) {
  const sb = await createClient();
  await sb
    .from("batch_leads")
    .update({ is_flagged: false, flag_reason: null })
    .eq("batch_id", batchId)
    .eq("lead_id", leadId);
  revalidatePath("/enrichment");
}

export async function disqualifyBatchLead(batchId: string, leadId: string) {
  const sb = await createClient();
  await sb
    .from("batch_leads")
    .update({ is_disqualified: true })
    .eq("batch_id", batchId)
    .eq("lead_id", leadId);
  revalidatePath("/enrichment");
}

export async function updateLeadField(
  leadId: string,
  field: string,
  value: unknown
) {
  const sb = await createClient();
  const topLevel = ["email", "name", "company", "notes"];
  if (topLevel.includes(field)) {
    const { error } = await sb
      .from("leads")
      .update({ [field]: value })
      .eq("id", leadId);
    if (error) throw error;
  } else {
    const { data: lead } = await sb
      .from("leads")
      .select("data")
      .eq("id", leadId)
      .single();
    if (lead) {
      const { error } = await sb
        .from("leads")
        .update({ data: { ...lead.data, [field]: value } })
        .eq("id", leadId);
      if (error) throw error;
    }
  }
  revalidatePath("/enrichment");
}

export async function deleteAllBatches() {
  const sb = await createClient();
  // Delete all batch_leads first (FK constraint)
  const { error: blErr } = await sb.from("batch_leads").delete().neq("batch_id", "00000000-0000-0000-0000-000000000000");
  if (blErr) throw blErr;
  // Delete all batches
  const { error } = await sb.from("batches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
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

export async function updateLeadRating(
  leadId: string,
  rating: number | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("leads")
    .update({ quality_rating: rating })
    .eq("id", leadId);
  if (error) throw error;
}

export type FolderBatchGroup = {
  folder_id: string;
  folder_name: string;
  batches: (Batch & { total: number; completed: number })[];
};

export async function getBatchesGroupedByFolder(): Promise<FolderBatchGroup[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  // Get folders for this company first
  const { data: companyFolders } = await sb
    .from("folders")
    .select("id, name")
    .eq("company_id", companyId);
  const companyFolderIds = (companyFolders ?? []).map((f) => f.id);
  if (companyFolderIds.length === 0) return [];
  const folderMap = new Map((companyFolders ?? []).map((f) => [f.id, f.name]));

  const { data: batches, error } = await sb
    .from("batches")
    .select("*")
    .in("folder_id", companyFolderIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Get unique folder IDs
  const folderIds = [...new Set((batches as Batch[]).map((b) => b.folder_id))];

  // Attach counts
  const batchesWithCounts: (Batch & { total: number; completed: number })[] = [];
  for (const b of batches as Batch[]) {
    const { count: total } = await sb
      .from("batch_leads")
      .select("batch_id", { count: "exact", head: true })
      .eq("batch_id", b.id);
    const { count: completed } = await sb
      .from("batch_leads")
      .select("batch_id", { count: "exact", head: true })
      .eq("batch_id", b.id)
      .eq("is_completed", true);
    batchesWithCounts.push({ ...b, total: total ?? 0, completed: completed ?? 0 });
  }

  // Group by folder
  const groups: FolderBatchGroup[] = [];
  for (const folderId of folderIds) {
    const folderBatches = batchesWithCounts
      .filter((b) => b.folder_id === folderId)
      .sort((a, b) => {
        // Extract batch number from name like "Prefix - Batch #3"
        const numA = parseInt(a.name.match(/#(\d+)/)?.[1] ?? "0", 10);
        const numB = parseInt(b.name.match(/#(\d+)/)?.[1] ?? "0", 10);
        if (numA !== numB) return numA - numB;
        // Fallback: sort by created_at ascending
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    groups.push({
      folder_id: folderId,
      folder_name: folderMap.get(folderId) ?? "Unknown Folder",
      batches: folderBatches,
    });
  }

  return groups;
}
