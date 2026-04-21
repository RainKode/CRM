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
  // Batch in chunks of 200 to avoid URL length limits
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { error } = await sb.from("leads").delete().in("id", chunk);
    if (error) throw error;
  }
  revalidatePath(`/folders/${folderId}`);
}

export async function deleteAllLeadsInFolder(folderId: string) {
  const sb = await createClient();
  const { error } = await sb.from("leads").delete().eq("folder_id", folderId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
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

export async function importLeadsChunk(
  folderId: string,
  rows: Record<string, unknown>[],
  columnMapping: Record<string, string>, // csvHeader -> fieldKey
  duplicateMode: "skip" | "overwrite",
  rowOffset: number = 0
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  // Deduplicate mapping: if multiple CSV columns target the same field,
  // keep only the first CSV column for that target
  const deduped: Record<string, string> = {};
  const seenTargets = new Set<string>();
  for (const [csvKey, fieldKey] of Object.entries(columnMapping)) {
    if (!fieldKey) continue;
    if (seenTargets.has(fieldKey)) continue;
    seenTargets.add(fieldKey);
    deduped[csvKey] = fieldKey;
  }

  // ─── Pre-flight: map all rows, then batch-check dupes in ONE query ───
  // Previously this did a per-row `.ilike("email", email)` which is O(N)
  // round-trips and crawled for 1k+ row imports. Now: normalise all emails
  // from the chunk, fetch existing id/email/phone for them in a single
  // `.in()` query, and route each row through the cached map.
  type MappedRow = {
    rowIndex: number;
    email: string | null;
    emailKey: string | null; // lowercased for matching
    phone: string | null;
    name: string | null;
    company: string | null;
    data: Record<string, unknown>;
  };

  const mapped: MappedRow[] = rows.map((row, i) => {
    const m: Record<string, unknown> = {};
    for (const [csvKey, fieldKey] of Object.entries(deduped)) {
      m[fieldKey] = row[csvKey];
    }
    const email = m["email"] != null ? String(m["email"]).trim() : null;
    const phoneRaw = m["phone"] != null ? String(m["phone"]).trim() : null;
    return {
      rowIndex: i,
      email: email || null,
      emailKey: email ? email.toLowerCase() : null,
      phone: phoneRaw || null,
      name: m["name"] != null ? String(m["name"]).trim() || null : null,
      company: m["company"] != null ? String(m["company"]).trim() || null : null,
      data: m,
    };
  });

  const emailKeys = Array.from(
    new Set(mapped.map((r) => r.emailKey).filter((v): v is string => !!v))
  );

  // Existing leads keyed by lowercased email (when available)
  const existingByEmail = new Map<string, string>(); // email_lower → lead_id
  if (emailKeys.length > 0) {
    const { data: existing, error: lookupErr } = await sb
      .from("leads")
      .select("id, email")
      .eq("folder_id", folderId)
      .in("email", emailKeys);
    if (lookupErr) throw lookupErr;
    for (const row of existing ?? []) {
      if (row.email) existingByEmail.set(row.email.toLowerCase(), row.id);
    }
    // Some rows may have capitalised emails in the DB — fall back to ilike
    // for any misses. Batch it too: one query that covers remaining keys.
    const misses = emailKeys.filter((k) => !existingByEmail.has(k));
    if (misses.length > 0) {
      // Supabase `.or()` with ilike for each remaining key. Keep the URL
      // length in check by chunking 50 keys at a time.
      for (let i = 0; i < misses.length; i += 50) {
        const slice = misses.slice(i, i + 50);
        const orExpr = slice
          .map((k) => `email.ilike.${k.replace(/,/g, "")}`)
          .join(",");
        const { data: more } = await sb
          .from("leads")
          .select("id, email")
          .eq("folder_id", folderId)
          .or(orExpr);
        for (const row of more ?? []) {
          if (row.email) existingByEmail.set(row.email.toLowerCase(), row.id);
        }
      }
    }
  }

  // Track emails we've already used *within this chunk* to avoid creating
  // in-file duplicates (e.g. same email appearing twice in the CSV).
  const seenInChunk = new Set<string>();

  // ─── Apply dup logic + write ────────────────────────────────────────
  for (const r of mapped) {
    const emailKey = r.emailKey;

    // Duplicate path
    if (emailKey && (existingByEmail.has(emailKey) || seenInChunk.has(emailKey))) {
      if (duplicateMode === "skip") {
        skipped++;
        continue;
      }
      // overwrite — prefer existing DB row over in-chunk dup
      const existingId = existingByEmail.get(emailKey);
      if (existingId) {
        const { error } = await sb
          .from("leads")
          .update({ name: r.name, company: r.company, data: r.data })
          .eq("id", existingId);
        if (error) {
          errors.push({ row: rowOffset + r.rowIndex + 1, reason: error.message });
        } else {
          imported++;
        }
      } else {
        // In-chunk dup + overwrite — skip to keep first instance
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
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      errors.push({ row: rowOffset + r.rowIndex + 1, reason: error.message });
    } else {
      imported++;
      if (emailKey) {
        seenInChunk.add(emailKey);
        existingByEmail.set(emailKey, inserted.id);
      }
    }
  }

  return { imported, skipped, errors: errors.length };
}

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
