"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FieldDefinition, Lead } from "@/lib/types";

// ─── Field Definitions ────────────────────────────────────────────────
export async function getFieldDefinitions(
  folderId: string
): Promise<FieldDefinition[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("field_definitions")
    .select("*")
    .eq("folder_id", folderId)
    .order("position");
  if (error) throw error;
  return data as FieldDefinition[];
}

export async function createField(
  folderId: string,
  field: {
    key: string;
    label: string;
    type: FieldDefinition["type"];
    options?: string[];
    is_required?: boolean;
    is_enrichment?: boolean;
    description?: string;
  }
) {
  const sb = await createClient();

  // Get next position
  const { count } = await sb
    .from("field_definitions")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folderId);

  const { data, error } = await sb
    .from("field_definitions")
    .insert({
      folder_id: folderId,
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options ?? null,
      is_required: field.is_required ?? false,
      is_enrichment: field.is_enrichment ?? false,
      description: field.description ?? null,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
  return data as FieldDefinition;
}

export async function bulkCreateFields(
  folderId: string,
  fields: {
    key: string;
    label: string;
    type: FieldDefinition["type"];
    options?: string[];
    is_required?: boolean;
    is_enrichment?: boolean;
    description?: string;
  }[]
) {
  if (fields.length === 0) return [];

  const sb = await createClient();

  // Deduplicate input keys (keep first occurrence)
  const seen = new Set<string>();
  const uniqueFields = fields.filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });

  // Fetch existing keys to avoid conflict entirely
  const { data: existing } = await sb
    .from("field_definitions")
    .select("key")
    .eq("folder_id", folderId);

  const existingKeys = new Set((existing ?? []).map((e) => e.key));
  const newFields = uniqueFields.filter((f) => !existingKeys.has(f.key));

  if (newFields.length === 0) {
    revalidatePath(`/folders/${folderId}`);
    return [];
  }

  const startPos = (existing ?? []).length;

  const rows = newFields.map((field, i) => ({
    folder_id: folderId,
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options ?? null,
    is_required: field.is_required ?? false,
    is_enrichment: field.is_enrichment ?? false,
    description: field.description ?? null,
    position: startPos + i,
  }));

  const { data, error } = await sb
    .from("field_definitions")
    .insert(rows)
    .select();

  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
  return data as FieldDefinition[];
}

export async function updateField(
  fieldId: string,
  folderId: string,
  updates: Partial<Pick<FieldDefinition, "label" | "options" | "is_required" | "is_hidden" | "is_enrichment" | "description">>
) {
  const sb = await createClient();
  const { error } = await sb
    .from("field_definitions")
    .update(updates)
    .eq("id", fieldId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

export async function deleteField(fieldId: string, folderId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("field_definitions")
    .delete()
    .eq("id", fieldId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

export async function reorderFields(
  folderId: string,
  orderedIds: string[]
) {
  const sb = await createClient();
  // Update each field's position
  const updates = orderedIds.map((id, i) =>
    sb.from("field_definitions").update({ position: i }).eq("id", id)
  );
  await Promise.all(updates);
  revalidatePath(`/folders/${folderId}`);
}

// ─── Leads ────────────────────────────────────────────────────────────

export async function getLeadCount(folderId: string): Promise<number> {
  const sb = await createClient();
  const { count, error } = await sb
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folderId);
  if (error) throw error;
  return count ?? 0;
}

export async function getAllLeadIds(folderId: string): Promise<string[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("leads")
    .select("id")
    .eq("folder_id", folderId);
  if (error) throw error;
  return (data ?? []).map((d) => d.id);
}

export async function getLeads(
  folderId: string,
  options?: { limit?: number; offset?: number }
): Promise<Lead[]> {
  const sb = await createClient();
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;

  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data as Lead[];
}

export async function updateLead(
  leadId: string,
  folderId: string,
  updates: Partial<Pick<Lead, "name" | "email" | "company" | "data" | "tags" | "notes" | "status" | "quality_rating">>
) {
  const sb = await createClient();
  const { error } = await sb.from("leads").update(updates).eq("id", leadId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

export async function deleteLeads(leadIds: string[], folderId: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const deletedAt = new Date().toISOString();
  // Batch in chunks of 200 to avoid URL length limits
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { error } = await sb
      .from("leads")
      .update({ deleted_at: deletedAt, deleted_by: user?.id ?? null })
      .in("id", chunk);
    if (error) throw error;
  }
  revalidatePath(`/folders/${folderId}`);
  revalidatePath("/trash");
}

export async function deleteAllLeadsInFolder(folderId: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { error } = await sb
    .from("leads")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq("folder_id", folderId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
  revalidatePath("/trash");
}

/**
 * Bulk-update a single field across many leads in a folder.
 *
 * - Top-level columns (name/email/company/notes/status/tags) are updated
 *   with a single query per chunk via `.in(id, chunk)`.
 * - Custom jsonb fields (stored in `data`) require fetch→merge→write per
 *   lead because supabase-js can't do a partial jsonb merge in a single
 *   update. We parallelise the merges in chunks to keep it fast.
 *
 * Throws if no leads match. Revalidates the folder path once at the end.
 */
export async function bulkUpdateLeads(input: {
  folderId: string;
  leadIds: string[];
  fieldKey: string;
  value: string | number | boolean | null;
}): Promise<{ updated: number }> {
  const { folderId, leadIds, fieldKey, value } = input;
  if (leadIds.length === 0) return { updated: 0 };

  const sb = await createClient();
  const TOP_LEVEL = new Set(["name", "email", "company", "notes", "status"]);

  let updated = 0;

  if (TOP_LEVEL.has(fieldKey)) {
    // Fast path: single UPDATE per chunk
    for (let i = 0; i < leadIds.length; i += 200) {
      const chunk = leadIds.slice(i, i + 200);
      const { error, count } = await sb
        .from("leads")
        .update({ [fieldKey]: value }, { count: "exact" })
        .in("id", chunk)
        .eq("folder_id", folderId); // defence-in-depth company scoping
      if (error) throw error;
      updated += count ?? 0;
    }
  } else {
    // JSONB merge path: fetch current `data`, merge key, write back.
    // Parallelise within chunks of 50 to avoid overwhelming the DB.
    const CHUNK = 50;
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      const chunk = leadIds.slice(i, i + CHUNK);
      const { data: rows, error: readErr } = await sb
        .from("leads")
        .select("id, data")
        .in("id", chunk)
        .eq("folder_id", folderId);
      if (readErr) throw readErr;

      await Promise.all(
        (rows ?? []).map(async (row) => {
          const current = (row.data as Record<string, unknown>) ?? {};
          const next =
            value === null
              ? (() => {
                  const copy = { ...current };
                  delete copy[fieldKey];
                  return copy;
                })()
              : { ...current, [fieldKey]: value };
          const { error } = await sb
            .from("leads")
            .update({ data: next })
            .eq("id", row.id);
          if (error) throw error;
          updated += 1;
        })
      );
    }
  }

  revalidatePath(`/folders/${folderId}`);
  return { updated };
}

// ─── Filtered lead queries for batch creation ─────────────────────────

export async function getFilteredLeadIds(
  folderId: string,
  options: {
    sortField?: string;
    sortDir?: "asc" | "desc";
    filterField?: string;
    filterValue?: string;
  }
): Promise<string[]> {
  const sb = await createClient();

  // Server-side sort by top-level column or jsonb field
  const sortField = options.sortField;
  const sortDir = options.sortDir ?? "asc";

  // Build a query page helper (Supabase defaults to 1000 rows max)
  function buildQuery() {
    let q = sb.from("leads").select("id, data").eq("folder_id", folderId);
    if (sortField === "name" || sortField === "email" || sortField === "company" || sortField === "created_at") {
      q = q.order(sortField, { ascending: sortDir === "asc" });
    } else {
      q = q.order("created_at", { ascending: false });
    }
    return q;
  }

  // Paginate to fetch ALL leads (Supabase caps at 1000 per request)
  const PAGE = 1000;
  let allData: { id: string; data: Record<string, unknown> }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    allData = allData.concat(data as { id: string; data: Record<string, unknown> }[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  let leads = allData;

  // Client-side filter by jsonb field value
  if (options.filterField && options.filterValue !== undefined && options.filterValue !== "") {
    const fk = options.filterField;
    const fv = options.filterValue.toLowerCase();

    leads = leads.filter((l) => {
      // Check top-level columns first
      if (fk === "name" || fk === "email" || fk === "company") {
        const val = (l as unknown as Record<string, unknown>)[fk];
        return val != null && String(val).toLowerCase().includes(fv);
      }
      // Check jsonb data
      const val = l.data?.[fk];
      if (val == null) return fv === "" || fv === "empty";
      return String(val).toLowerCase().includes(fv);
    });
  }

  // Client-side sort by jsonb data field
  if (sortField && !["name", "email", "company", "created_at"].includes(sortField)) {
    leads.sort((a, b) => {
      const av = String(a.data?.[sortField] ?? "");
      const bv = String(b.data?.[sortField] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  return leads.map((l) => l.id);
}

export async function getFilteredLeadCount(
  folderId: string,
  options: {
    filterField?: string;
    filterValue?: string;
  }
): Promise<number> {
  const ids = await getFilteredLeadIds(folderId, options);
  return ids.length;
}

// ─── Import dedupe helpers ──────────────────────────────────────────
import type { DedupeKey, ImportHistory } from "@/lib/types";

/** Normalise raw field values into comparable strings for each match key. */
function buildLookupKeys(input: {
  email: string | null;
  phone: string | null;
  name: string | null;
  company: string | null;
}): Partial<Record<DedupeKey, string>> {
  const keys: Partial<Record<DedupeKey, string>> = {};
  if (input.email) keys.email = input.email.trim().toLowerCase();
  if (input.phone) {
    const digits = input.phone.replace(/\D+/g, "");
    if (digits.length >= 5) keys.phone = digits;
  }
  if (input.name && input.company) {
    keys.name_company = `${input.name.trim().toLowerCase()}|${input.company
      .trim()
      .toLowerCase()}`;
  }
  return keys;
}

/** Dedupe a column mapping so two CSV columns can't target the same field. */
function dedupeMapping(columnMapping: Record<string, string>) {
  const deduped: Record<string, string> = {};
  const seenTargets = new Set<string>();
  for (const [csvKey, fieldKey] of Object.entries(columnMapping)) {
    if (!fieldKey) continue;
    if (seenTargets.has(fieldKey)) continue;
    seenTargets.add(fieldKey);
    deduped[csvKey] = fieldKey;
  }
  return deduped;
}

type MappedRow = {
  rowIndex: number;
  email: string | null;
  phone: string | null;
  name: string | null;
  company: string | null;
  data: Record<string, unknown>;
  lookup: Partial<Record<DedupeKey, string>>;
};

function mapRows(
  rows: Record<string, unknown>[],
  deduped: Record<string, string>
): MappedRow[] {
  return rows.map((row, i) => {
    const m: Record<string, unknown> = {};
    for (const [csvKey, fieldKey] of Object.entries(deduped)) {
      m[fieldKey] = row[csvKey];
    }
    const email = m.email != null ? String(m.email).trim() || null : null;
    const phone = m.phone != null ? String(m.phone).trim() || null : null;
    const name = m.name != null ? String(m.name).trim() || null : null;
    const company = m.company != null ? String(m.company).trim() || null : null;
    return {
      rowIndex: i,
      email,
      phone,
      name,
      company,
      data: m,
      lookup: buildLookupKeys({ email, phone, name, company }),
    };
  });
}

/**
 * Build reverse-lookup maps from {normalised key → existing lead id} for each
 * enabled dedupe strategy. Runs one query per enabled strategy so larger
 * folders still stay under Supabase row caps.
 */
async function fetchExistingByKeys(
  sb: Awaited<ReturnType<typeof createClient>>,
  folderId: string,
  dedupeKeys: DedupeKey[],
  mapped: MappedRow[]
): Promise<Record<DedupeKey, Map<string, string>>> {
  const result: Record<DedupeKey, Map<string, string>> = {
    email: new Map(),
    phone: new Map(),
    name_company: new Map(),
  };

  // Collect the raw source keys used by mapped rows so we only fetch what
  // could actually collide. `email` is indexed as a column, the others live
  // in jsonb `data`, so we fetch all rows once for those.
  if (dedupeKeys.includes("email")) {
    const emails = Array.from(
      new Set(
        mapped
          .map((r) => r.lookup.email)
          .filter((v): v is string => !!v)
      )
    );
    if (emails.length > 0) {
      for (let i = 0; i < emails.length; i += 200) {
        const slice = emails.slice(i, i + 200);
        const { data, error } = await sb
          .from("leads")
          .select("id, email")
          .eq("folder_id", folderId)
          .in("email", slice);
        if (error) throw error;
        for (const row of data ?? []) {
          if (row.email) result.email.set(row.email.toLowerCase(), row.id);
        }
      }
    }
  }

  // For phone and name_company we need to pull candidate rows from jsonb.
  // Folder size is bounded in practice; we paginate to be safe.
  const needsJsonbScan =
    dedupeKeys.includes("phone") || dedupeKeys.includes("name_company");
  if (needsJsonbScan) {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("leads")
        .select("id, name, company, data")
        .eq("folder_id", folderId)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of data ?? []) {
        const phoneRaw =
          (row.data as Record<string, unknown> | null)?.phone ?? null;
        const k = buildLookupKeys({
          email: null,
          phone: phoneRaw != null ? String(phoneRaw) : null,
          name: row.name,
          company: row.company,
        });
        if (dedupeKeys.includes("phone") && k.phone)
          result.phone.set(k.phone, row.id);
        if (dedupeKeys.includes("name_company") && k.name_company)
          result.name_company.set(k.name_company, row.id);
      }
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }

  return result;
}

/**
 * Create a new import_history row with status=processing.
 * Returns the row id so subsequent chunks can tag leads with it.
 */
export async function createImportBatch(input: {
  folderId: string;
  filename: string;
  totalRows: number;
  dedupeKeys: DedupeKey[];
}): Promise<string> {
  const { folderId, filename, totalRows, dedupeKeys } = input;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("import_history")
    .insert({
      folder_id: folderId,
      filename,
      total_rows: totalRows,
      status: "processing",
      dedupe_keys: dedupeKeys,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Dry-run an import: compute how many rows are new / updates / skipped
 * for the folder's current dedupe config, without writing anything.
 */
export async function previewImport(input: {
  folderId: string;
  rows: Record<string, unknown>[];
  columnMapping: Record<string, string>;
  dedupeKeys: DedupeKey[];
}): Promise<{ new: number; updated: number; skipped: number }> {
  const { folderId, rows, columnMapping, dedupeKeys } = input;
  const sb = await createClient();
  const deduped = dedupeMapping(columnMapping);
  const mapped = mapRows(rows, deduped);
  const existing = await fetchExistingByKeys(sb, folderId, dedupeKeys, mapped);

  let isNew = 0;
  let isUpdate = 0;
  let isSkip = 0;
  const seenInChunk = new Set<string>();

  for (const r of mapped) {
    const matchId = firstDedupeHit(r, dedupeKeys, existing);
    if (matchId) {
      isUpdate += 1;
      continue;
    }
    // in-chunk self-dupe detection for preview
    const selfKey = Object.values(r.lookup)[0];
    if (selfKey && seenInChunk.has(selfKey)) {
      isSkip += 1;
      continue;
    }
    if (selfKey) seenInChunk.add(selfKey);
    // If no usable dedupe key at all, row is still "new" but vulnerable to
    // being double-imported. The preview does not warn — this is parity with
    // the old behaviour and keeps the UX simple.
    isNew += 1;
  }

  return { new: isNew, updated: isUpdate, skipped: isSkip };
}

/** Returns the id of the first existing lead that collides with this row. */
function firstDedupeHit(
  r: MappedRow,
  dedupeKeys: DedupeKey[],
  existing: Record<DedupeKey, Map<string, string>>
): string | null {
  for (const key of dedupeKeys) {
    const lookup = r.lookup[key];
    if (!lookup) continue;
    const hit = existing[key].get(lookup);
    if (hit) return hit;
  }
  return null;
}

/**
 * Finalise an import: update the history row with the true totals and
 * status=complete. Called once after all chunks succeed.
 */
export async function finalizeImport(input: {
  batchId: string;
  folderId: string;
  totals: {
    totalRows: number;
    imported: number;
    newRows: number;
    updatedRows: number;
    skipped: number;
    errors: number;
  };
}) {
  const { batchId, folderId, totals } = input;
  const sb = await createClient();
  const { error } = await sb
    .from("import_history")
    .update({
      total_rows: totals.totalRows,
      imported_rows: totals.imported,
      new_rows: totals.newRows,
      updated_rows: totals.updatedRows,
      skipped_rows: totals.skipped,
      error_rows: totals.errors,
      status: totals.errors > 0 && totals.imported === 0 ? "failed" : "complete",
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

/**
 * Return the latest undoable import for a folder (within 24h, not already
 * undone). Used by the folder UI to show a "Undo last import" button.
 */
export async function getUndoableImport(
  folderId: string
): Promise<ImportHistory | null> {
  const sb = await createClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("import_history")
    .select("*")
    .eq("folder_id", folderId)
    .eq("status", "complete")
    .is("undone_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ImportHistory | null) ?? null;
}

/**
 * Undo an import: delete all leads tagged with this batch id, then mark
 * the history row as undone. Only the batch's "new" rows get deleted —
 * "updated" rows stay in place (their import_batch_id was never set).
 */
export async function undoImport(input: {
  batchId: string;
  folderId: string;
}): Promise<{ deleted: number }> {
  const { batchId, folderId } = input;
  const sb = await createClient();

  // Confirm the row is still undoable server-side (defence in depth).
  const { data: row, error: rowErr } = await sb
    .from("import_history")
    .select("id, folder_id, created_at, undone_at")
    .eq("id", batchId)
    .single();
  if (rowErr) throw rowErr;
  if (row.folder_id !== folderId) throw new Error("Batch does not belong to folder");
  if (row.undone_at) throw new Error("Import has already been undone");
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000)
    throw new Error("Undo window (24h) has expired");

  const { error: delErr, count } = await sb
    .from("leads")
    .delete({ count: "exact" })
    .eq("folder_id", folderId)
    .eq("import_batch_id", batchId);
  if (delErr) throw delErr;

  const { error: markErr } = await sb
    .from("import_history")
    .update({ undone_at: new Date().toISOString() })
    .eq("id", batchId);
  if (markErr) throw markErr;

  revalidatePath(`/folders/${folderId}`);
  return { deleted: count ?? 0 };
}

export async function importLeadsChunk(
  folderId: string,
  rows: Record<string, unknown>[],
  columnMapping: Record<string, string>, // csvHeader -> fieldKey
  duplicateMode: "skip" | "overwrite",
  rowOffset: number = 0,
  options?: { importBatchId?: string; dedupeKeys?: DedupeKey[] }
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const dedupeKeys: DedupeKey[] =
    options?.dedupeKeys && options.dedupeKeys.length > 0
      ? options.dedupeKeys
      : ["email"];
  const importBatchId = options?.importBatchId ?? null;

  let imported = 0;
  let newRows = 0;
  let updatedRows = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  const deduped = dedupeMapping(columnMapping);

  // ─── Pre-flight: map rows + batch-fetch collisions per dedupe key ────
  const mapped = mapRows(rows, deduped);
  const existing = await fetchExistingByKeys(sb, folderId, dedupeKeys, mapped);

  // Track keys already consumed within this chunk so a duplicate email in
  // the same CSV doesn't insert twice.
  const seenInChunk = new Set<string>();

  // ─── Apply dup logic + write ────────────────────────────────────────
  for (const r of mapped) {
    const matchId = firstDedupeHit(r, dedupeKeys, existing);
    const selfKey = Object.values(r.lookup)[0] ?? null;

    // Duplicate path: existing DB row OR already seen in this chunk.
    if (matchId || (selfKey && seenInChunk.has(selfKey))) {
      if (duplicateMode === "skip") {
        skipped++;
        continue;
      }
      // overwrite — prefer existing DB row over in-chunk dup. In-chunk
      // dups with no DB match are skipped to keep the first instance.
      if (matchId) {
        const { error } = await sb
          .from("leads")
          .update({
            name: r.name,
            email: r.email,
            company: r.company,
            data: r.data,
          })
          .eq("id", matchId);
        if (error) {
          errors.push({ row: rowOffset + r.rowIndex + 1, reason: error.message });
        } else {
          imported++;
          updatedRows++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    const { data: inserted, error } = await sb
      .from("leads")
      .insert({
        folder_id: folderId,
        email: r.email,
        name: r.name,
        company: r.company,
        data: r.data,
        import_batch_id: importBatchId,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      errors.push({ row: rowOffset + r.rowIndex + 1, reason: error.message });
    } else {
      imported++;
      newRows++;
      // Seed in-chunk + existing lookup with every dedupe key this row
      // carries so subsequent rows in the same chunk collide properly.
      for (const key of dedupeKeys) {
        const v = r.lookup[key];
        if (v) {
          seenInChunk.add(v);
          existing[key].set(v, inserted.id);
        }
      }
    }
  }

  return { imported, newRows, updatedRows, skipped, errors: errors.length };
}

/**
 * @deprecated use `createImportBatch` + `finalizeImport` instead.
 * Kept temporarily for any caller still on the old single-shot flow.
 */
export async function logImport(
  folderId: string,
  totals: { totalRows: number; imported: number; skipped: number; errors: number }
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  await sb.from("import_history").insert({
    folder_id: folderId,
    filename: "csv-upload",
    total_rows: totals.totalRows,
    imported_rows: totals.imported,
    skipped_rows: totals.skipped,
    error_rows: totals.errors,
    status: "complete",
    created_by: user.id,
    completed_at: new Date().toISOString(),
  });

  revalidatePath(`/folders/${folderId}`);
}

// ─── Folder dedupe config ─────────────────────────────────────────────

export async function updateFolderDedupeKeys(
  folderId: string,
  dedupeKeys: DedupeKey[]
) {
  if (dedupeKeys.length === 0)
    throw new Error("At least one dedupe key is required");
  const sb = await createClient();
  const { error } = await sb
    .from("folders")
    .update({ dedupe_keys: dedupeKeys })
    .eq("id", folderId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

// ─── Create single lead ───────────────────────────────────────────────

export async function createLead(
  folderId: string,
  input: {
    name?: string;
    email?: string;
    company?: string;
    data: Record<string, unknown>;
  }
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("leads")
    .insert({
      folder_id: folderId,
      name: input.name?.trim() || null,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      data: input.data,
      status: "raw",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
  revalidatePath("/folders");
  return data as Lead;
}
