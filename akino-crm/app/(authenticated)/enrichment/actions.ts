"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Batch, BatchLead, Lead, FieldDefinition } from "@/lib/types";
import { createPipelineForBatch } from "@/app/(authenticated)/pipeline/actions";
import { BATCH_DELETE_PHRASE } from "./constants";

/**
 * Aggregate batch-level counts from a flat list of batch_leads rows.
 * Single source of truth so getBatches + getBatchesGroupedByFolder share logic.
 */
function aggregateBatchCounts(
  rows: { batch_id: string; is_completed: boolean | null }[]
): Map<string, { total: number; completed: number }> {
  const map = new Map<string, { total: number; completed: number }>();
  for (const r of rows) {
    const entry = map.get(r.batch_id) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (r.is_completed) entry.completed += 1;
    map.set(r.batch_id, entry);
  }
  return map;
}

export async function getBatches(folderId?: string): Promise<(Batch & { total: number; completed: number })[]> {
  const sb = await createClient();

  let q = sb.from("batches").select("*").order("created_at", { ascending: false });
  if (folderId) q = q.eq("folder_id", folderId);

  const { data, error } = await q;
  if (error) throw error;
  const batches = data as Batch[];
  if (batches.length === 0) return [];

  // ONE query to fetch all batch_leads rows for these batches, then aggregate in JS.
  // Replaces the old N+1 (2 COUNT queries per batch).
  const batchIds = batches.map((b) => b.id);
  const { data: blRows, error: blErr } = await sb
    .from("batch_leads")
    .select("batch_id, is_completed")
    .in("batch_id", batchIds);
  if (blErr) throw blErr;

  const counts = aggregateBatchCounts(blRows ?? []);
  return batches.map((b) => ({
    ...b,
    total: counts.get(b.id)?.total ?? 0,
    completed: counts.get(b.id)?.completed ?? 0,
  }));
}

export async function createBatch(input: {
  folder_id: string;
  name: string;
  description?: string;
  lead_ids: string[];
  assignee_id?: string;
  sort_by_field?: string;
  filter_by_field?: string;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Pre-filter: exclude leads already in an active (incomplete) batch.
  // The partial unique index uniq_lead_active_batch prevents a lead from
  // appearing in more than one active batch — inserting one would throw.
  let freeIds = input.lead_ids;
  if (input.lead_ids.length > 0) {
    const { data: activeBatchLeads, error: activeErr } = await sb
      .from("batch_leads")
      .select("lead_id")
      .eq("is_completed", false)
      .in("lead_id", input.lead_ids);
    if (activeErr) throw activeErr;
    const alreadyActiveSet = new Set((activeBatchLeads ?? []).map((r) => r.lead_id));
    freeIds = input.lead_ids.filter((id) => !alreadyActiveSet.has(id));
  }

  const { data: batch, error } = await sb
    .from("batches")
    .insert({
      folder_id: input.folder_id,
      name: input.name,
      description: input.description ?? null,
      assignee_id: input.assignee_id ?? null,
      created_by: user.id,
      sort_by_field: input.sort_by_field ?? null,
      filter_by_field: input.filter_by_field ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert batch_leads with upsert to guard against intra-payload dupes.
  if (freeIds.length > 0) {
    const { error: blErr } = await sb.from("batch_leads").upsert(
      freeIds.map((lid) => ({
        batch_id: batch.id,
        lead_id: lid,
      })),
      { onConflict: "batch_id,lead_id", ignoreDuplicates: true }
    );
    if (blErr) {
      // Best-effort rollback: remove the orphaned batch row.
      await sb.from("batches").delete().eq("id", batch.id);
      const pg = blErr as { code?: string; message?: string; details?: string };
      const msg = [pg.code, pg.message, pg.details].filter(Boolean).join(" | ");
      console.error("createBatch: batch_leads insert failed for batch", batch.id, blErr);
      throw new Error(`Failed to assign leads to batch "${input.name}": ${msg}`);
    }
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
  sort_by_field?: string;
  filter_by_field?: string;
}): Promise<{ created: Batch[]; skippedLeadCount: number }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { batch_size, name_prefix, folder_id } = input;

  // Pre-filter: exclude leads already in an active (incomplete) batch.
  // The partial unique index uniq_lead_active_batch prevents a lead from
  // appearing in more than one active batch — inserting one would throw,
  // leaving an empty ghost batch row behind.
  let freeIds = input.lead_ids;
  if (input.lead_ids.length > 0) {
    const { data: activeBatchLeads, error: activeErr } = await sb
      .from("batch_leads")
      .select("lead_id")
      .eq("is_completed", false)
      .in("lead_id", input.lead_ids);
    if (activeErr) throw activeErr;
    const alreadyActiveSet = new Set((activeBatchLeads ?? []).map((r) => r.lead_id));
    freeIds = input.lead_ids.filter((id) => !alreadyActiveSet.has(id));
  }

  const skippedLeadCount = input.lead_ids.length - freeIds.length;

  if (freeIds.length === 0) {
    revalidatePath("/enrichment");
    return { created: [], skippedLeadCount };
  }

  const totalBatches = Math.ceil(freeIds.length / batch_size);
  const created: Batch[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const chunk = freeIds.slice(i * batch_size, (i + 1) * batch_size);
    const batchName = `${name_prefix} - Batch #${i + 1}`;

    const { data: batch, error } = await sb
      .from("batches")
      .insert({
        folder_id,
        name: batchName,
        created_by: user.id,
        sort_by_field: input.sort_by_field ?? null,
        filter_by_field: input.filter_by_field ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Insert batch_leads in chunks of 500.
    // Upsert with ignoreDuplicates guards against intra-payload dupes.
    // If the insert still fails, roll back the just-created batch row so
    // no empty ghost batches accumulate.
    let batchLeadErr: unknown = null;
    for (let j = 0; j < chunk.length; j += 500) {
      const slice = chunk.slice(j, j + 500);
      const { error: blErr } = await sb.from("batch_leads").upsert(
        slice.map((lid) => ({ batch_id: batch.id, lead_id: lid })),
        { onConflict: "batch_id,lead_id", ignoreDuplicates: true }
      );
      if (blErr) {
        batchLeadErr = blErr;
        break;
      }
    }

    if (batchLeadErr) {
      // Best-effort rollback: remove the empty batch row.
      await sb.from("batches").delete().eq("id", batch.id);
      const pg = batchLeadErr as { code?: string; message?: string; details?: string };
      const msg = [pg.code, pg.message, pg.details].filter(Boolean).join(" | ");
      console.error("createMultipleBatches: batch_leads insert failed for batch", batch.id, batchLeadErr);
      throw new Error(`Failed to assign leads to batch "${batchName}": ${msg}`);
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
  return { created, skippedLeadCount };
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

  // ─── Parallel pass 1: independent writes + lookups ────────────────
  // The lead update, the batch_lead completion mark, and the pipeline
  // lookup are all independent of each other. Fire them in parallel.
  const nowIso = new Date().toISOString();
  const [, , pipelineRes] = await Promise.all([
    // Update lead
    lead
      ? sb
          .from("leads")
          .update({
            data: mergedData,
            email: extractedEmail,
            company: extractedCompany,
            status: "enriched",
            enriched_at: nowIso,
          })
          .eq("id", leadId)
      : Promise.resolve({ error: null }),
    // Mark batch_lead complete
    sb
      .from("batch_leads")
      .update({
        is_completed: true,
        completed_at: nowIso,
        completed_by: user?.id ?? null,
      })
      .eq("batch_id", batchId)
      .eq("lead_id", leadId),
    // Pipeline lookup for auto-deal-create
    sb
      .from("pipelines")
      .select("id")
      .eq("batch_id", batchId)
      .eq("is_archived", false)
      .maybeSingle(),
  ]);

  const pipeline = pipelineRes.data as { id: string } | null;

  // ─── Parallel pass 2: deal creation (depends on pipeline) +
  //     batch-remaining count (independent). ─────────────────────────
  const dealCreatePromise = (async () => {
    if (!pipeline) return;
    try {
      const { data: firstStage } = await sb
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstStage) return;

      const { count: existingDeals } = await sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .is("won_at", null)
        .is("lost_at", null);

      if ((existingDeals ?? 0) === 0) {
        const companyId = await getActiveCompanyId();
        await sb.from("deals").insert({
          company_id: companyId,
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
    } catch (err) {
      // Non-fatal: don't block enrichment if deal creation fails
      console.error("Auto-create deal failed for lead", leadId, err);
    }
  })();

  const remainingPromise = sb
    .from("batch_leads")
    .select("batch_id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("is_completed", false);

  const [, remainingRes] = await Promise.all([
    dealCreatePromise,
    remainingPromise,
  ]);

  const remaining = remainingRes.count;
  if (remaining === 0) {
    await sb
      .from("batches")
      .update({ status: "complete", completed_at: nowIso })
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

// ⚠️ REMOVED: `deleteAllBatches()` was a non-scoped, non-confirmed mass-delete
// that could wipe every batch across every company. Replaced by the triple-
// gate `deleteBatch()` defined at the bottom of this file.

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

  // ONE query for all batch_leads rows across all batches; aggregate in JS.
  const batchRows = batches as Batch[];
  const batchIds = batchRows.map((b) => b.id);
  let counts = new Map<string, { total: number; completed: number }>();
  if (batchIds.length > 0) {
    const { data: blRows, error: blErr } = await sb
      .from("batch_leads")
      .select("batch_id, is_completed")
      .in("batch_id", batchIds);
    if (blErr) throw blErr;
    counts = aggregateBatchCounts(blRows ?? []);
  }
  const batchesWithCounts: (Batch & { total: number; completed: number })[] = batchRows.map((b) => ({
    ...b,
    total: counts.get(b.id)?.total ?? 0,
    completed: counts.get(b.id)?.completed ?? 0,
  }));

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

// ─── Triple-confirm batch deletion ────────────────────────────────────
// Require three independent gates BEFORE destroying data:
//   1. The caller must pass `acknowledgements.understandsLeadsAffected = true`
//   2. The caller must pass `acknowledgements.understandsIrreversible = true`
//   3. The typed `confirmName` must exactly match the batch's name, AND
//      the typed `confirmPhrase` must equal "DELETE FOREVER".
// Any failure throws with a specific reason so the UI can surface it.
//
// Note: BATCH_DELETE_PHRASE lives in ./constants.ts because "use server"
// files may only export async functions.

export async function deleteBatch(input: {
  batchId: string;
  confirmName: string;
  confirmPhrase: string;
  acknowledgements: {
    understandsLeadsAffected: boolean;
    understandsIrreversible: boolean;
  };
}): Promise<{ ok: true; deletedBatchId: string; affectedLeadCount: number }> {
  const sb = await createClient();

  // Gate 1 + 2: explicit acknowledgements
  if (!input.acknowledgements.understandsLeadsAffected) {
    throw new Error("You must acknowledge that batch leads will be affected.");
  }
  if (!input.acknowledgements.understandsIrreversible) {
    throw new Error("You must acknowledge that this action is irreversible.");
  }

  // Auth + ownership check (RLS also enforces, but fail fast + clearer error)
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Load the batch and verify name (must be inside company via RLS)
  const { data: batch, error: loadErr } = await sb
    .from("batches")
    .select("id, name, folder_id")
    .eq("id", input.batchId)
    .single();
  if (loadErr || !batch) throw new Error("Batch not found or access denied.");

  // Gate 3a: typed name must match exactly (trim only outer whitespace)
  if (input.confirmName.trim() !== batch.name) {
    throw new Error(
      `Confirmation name does not match. Type "${batch.name}" exactly.`
    );
  }
  // Gate 3b: typed phrase must match the literal constant
  if (input.confirmPhrase.trim() !== BATCH_DELETE_PHRASE) {
    throw new Error(`You must type "${BATCH_DELETE_PHRASE}" to confirm.`);
  }

  // Capture lead count for the response (for UI feedback / audit)
  const { count: affectedLeadCount } = await sb
    .from("batch_leads")
    .select("batch_id", { count: "exact", head: true })
    .eq("batch_id", batch.id);

  try {
    // Archive the auto-created pipeline for this batch BEFORE deleting the batch
    // row. Once the batch row is gone the FK becomes null and we can't find it.
    // Non-fatal: if RLS denies the update we log it and proceed with deletion.
    const { error: archErr } = await sb
      .from("pipelines")
      .update({ is_archived: true })
      .eq("batch_id", batch.id);
    if (archErr) {
      console.error("deleteBatch: pipeline archive failed (non-fatal)", archErr);
    }

    // Delete. batch_leads has `on delete cascade`, so deleting the batch
    // row is sufficient. We still delete batch_leads first as defence in
    // depth in case the FK is ever changed.
    const { error: blErr } = await sb
      .from("batch_leads")
      .delete()
      .eq("batch_id", batch.id);
    if (blErr) {
      const pg = blErr as { code?: string; message?: string; details?: string };
      const msg = [pg.code, pg.message, pg.details].filter(Boolean).join(" | ");
      throw new Error(`Failed to delete batch leads: ${msg}`);
    }

    const { error: delErr } = await sb
      .from("batches")
      .delete()
      .eq("id", batch.id);
    if (delErr) {
      const pg = delErr as { code?: string; message?: string; details?: string };
      const msg = [pg.code, pg.message, pg.details].filter(Boolean).join(" | ");
      throw new Error(`Failed to delete batch: ${msg}`);
    }
  } catch (err) {
    console.error("deleteBatch: error deleting batch", input.batchId, err);
    if (err instanceof Error) throw err;
    throw new Error("Unexpected error during batch deletion.");
  }

  revalidatePath("/enrichment");
  revalidatePath("/pipeline");
  revalidatePath(`/folders/${batch.folder_id}`);

  return {
    ok: true,
    deletedBatchId: batch.id,
    affectedLeadCount: affectedLeadCount ?? 0,
  };
}
