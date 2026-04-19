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
  updates: Partial<Pick<Lead, "name" | "email" | "company" | "data" | "tags" | "notes" | "status">>
) {
  const sb = await createClient();
  const { error } = await sb.from("leads").update(updates).eq("id", leadId);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

export async function deleteLeads(leadIds: string[], folderId: string) {
  const sb = await createClient();
  const { error } = await sb.from("leads").delete().in("id", leadIds);
  if (error) throw error;
  revalidatePath(`/folders/${folderId}`);
}

export async function importLeads(
  folderId: string,
  rows: Record<string, unknown>[],
  columnMapping: Record<string, string>, // csvHeader -> fieldKey
  duplicateMode: "skip" | "overwrite"
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped: Record<string, unknown> = {};

    for (const [csvKey, fieldKey] of Object.entries(columnMapping)) {
      if (!fieldKey) continue;
      mapped[fieldKey] = row[csvKey];
    }

    // Extract top-level columns if matching keys exist in the mapped data
    const email = (mapped["email"] as string) ?? null;
    const name = (mapped["name"] as string) ?? null;
    const company = (mapped["company"] as string) ?? null;

    // Duplicate check by email
    if (email) {
      const { data: existing } = await sb
        .from("leads")
        .select("id")
        .eq("folder_id", folderId)
        .ilike("email", email)
        .maybeSingle();

      if (existing) {
        if (duplicateMode === "skip") {
          skipped++;
          continue;
        }
        // overwrite
        const { error } = await sb
          .from("leads")
          .update({ name, company, data: mapped })
          .eq("id", existing.id);
        if (error) {
          errors.push({ row: i + 1, reason: error.message });
        } else {
          imported++;
        }
        continue;
      }
    }

    const { error } = await sb.from("leads").insert({
      folder_id: folderId,
      email,
      name,
      company,
      data: mapped,
      created_by: user.id,
    });
    if (error) {
      errors.push({ row: i + 1, reason: error.message });
    } else {
      imported++;
    }
  }

  // Log import
  await sb.from("import_history").insert({
    folder_id: folderId,
    filename: "csv-upload",
    total_rows: rows.length,
    imported_rows: imported,
    skipped_rows: skipped,
    error_rows: errors.length,
    error_report: errors.length > 0 ? errors : null,
    status: "complete",
    created_by: user.id,
    completed_at: new Date().toISOString(),
  });

  revalidatePath(`/folders/${folderId}`);
  return { imported, skipped, errors: errors.length };
}
