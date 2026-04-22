"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PipelineTemplate, PipelineTemplateStage, PipelineTemplateWithStages } from "@/lib/types";

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<PipelineTemplateWithStages[]> {
  const companyId = await getActiveCompanyId();
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("pipeline_templates")
    .select("*, stages:pipeline_template_stages(*)")
    .eq("company_id", companyId)
    .eq("is_archived", false)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    ...t,
    stages: ((t.stages as PipelineTemplateStage[]) ?? []).sort(
      (a, b) => a.position - b.position
    ),
  }));
}

export async function getTemplate(
  templateId: string
): Promise<PipelineTemplateWithStages | null> {
  const companyId = await getActiveCompanyId();
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("pipeline_templates")
    .select("*, stages:pipeline_template_stages(*)")
    .eq("id", templateId)
    .eq("company_id", companyId)
    .single();
  if (error) return null;
  return {
    ...data,
    stages: ((data.stages as PipelineTemplateStage[]) ?? []).sort(
      (a, b) => a.position - b.position
    ),
  };
}

// ─── Template CRUD ─────────────────────────────────────────────────────────────

export async function createTemplate(name: string): Promise<PipelineTemplate> {
  const companyId = await getActiveCompanyId();
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pipeline_templates")
    .insert({
      company_id: companyId,
      name: name.trim(),
      is_default: false,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  // Seed with the same 8 canonical stages
  const { error: stagesErr } = await admin.from("pipeline_template_stages").insert([
    { template_id: data.id, name: "New",            position: 0, is_won: false, is_lost: false },
    { template_id: data.id, name: "Contacted",      position: 1, is_won: false, is_lost: false },
    { template_id: data.id, name: "Responded",      position: 2, is_won: false, is_lost: false },
    { template_id: data.id, name: "Meeting Booked", position: 3, is_won: false, is_lost: false },
    { template_id: data.id, name: "Proposal Sent",  position: 4, is_won: false, is_lost: false },
    { template_id: data.id, name: "Negotiation",    position: 5, is_won: false, is_lost: false },
    { template_id: data.id, name: "Won",            position: 6, is_won: true,  is_lost: false },
    { template_id: data.id, name: "Lost",           position: 7, is_won: false, is_lost: true  },
  ]);
  if (stagesErr) throw stagesErr;

  revalidatePath("/settings/pipelines");
  return data as PipelineTemplate;
}

export async function updateTemplate(
  templateId: string,
  updates: { name?: string; is_default?: boolean }
): Promise<void> {
  const companyId = await getActiveCompanyId();
  const admin = createAdminClient();

  // If marking as default, clear existing defaults first
  if (updates.is_default) {
    await admin
      .from("pipeline_templates")
      .update({ is_default: false })
      .eq("company_id", companyId);
  }

  const { error } = await admin
    .from("pipeline_templates")
    .update(updates)
    .eq("id", templateId)
    .eq("company_id", companyId);
  if (error) throw error;

  revalidatePath("/settings/pipelines");
}

export async function archiveTemplate(templateId: string): Promise<void> {
  const companyId = await getActiveCompanyId();

  // Cannot archive if it's the only non-archived template
  const admin = createAdminClient();
  const { count } = await admin
    .from("pipeline_templates")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_archived", false);
  if ((count ?? 0) <= 1) {
    throw new Error("Cannot archive the only template. Create another template first.");
  }

  const { error } = await admin
    .from("pipeline_templates")
    .update({ is_archived: true, is_default: false })
    .eq("id", templateId)
    .eq("company_id", companyId);
  if (error) throw error;

  // If we archived the default, promote the oldest remaining one
  const { data: remaining } = await admin
    .from("pipeline_templates")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_archived", false)
    .order("created_at")
    .limit(1);
  if (remaining && remaining.length > 0) {
    await admin
      .from("pipeline_templates")
      .update({ is_default: true })
      .eq("id", remaining[0].id);
  }

  revalidatePath("/settings/pipelines");
}

// ─── Template stage CRUD ───────────────────────────────────────────────────────

export async function addTemplateStage(
  templateId: string,
  name: string
): Promise<PipelineTemplateStage> {
  const companyId = await getActiveCompanyId();
  const admin = createAdminClient();

  // Verify ownership
  const { data: tmpl } = await admin
    .from("pipeline_templates")
    .select("id")
    .eq("id", templateId)
    .eq("company_id", companyId)
    .single();
  if (!tmpl) throw new Error("Template not found");

  // Insert before won/lost stages (find the highest non-terminal position)
  const { data: existing } = await admin
    .from("pipeline_template_stages")
    .select("position, is_won, is_lost")
    .eq("template_id", templateId)
    .eq("is_archived", false)
    .order("position");

  const terminals = (existing ?? []).filter((s) => s.is_won || s.is_lost);
  const nonTerminals = (existing ?? []).filter((s) => !s.is_won && !s.is_lost);
  const newPos = nonTerminals.length > 0
    ? (nonTerminals[nonTerminals.length - 1].position + 1)
    : 0;

  // Shift terminal stages up
  for (const t of terminals) {
    await admin
      .from("pipeline_template_stages")
      .update({ position: t.position + 1 })
      .eq("template_id", templateId)
      .eq("position", t.position);
  }

  const { data, error } = await admin
    .from("pipeline_template_stages")
    .insert({ template_id: templateId, name: name.trim(), position: newPos })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/settings/pipelines");
  return data as PipelineTemplateStage;
}

export async function updateTemplateStage(
  stageId: string,
  updates: { name?: string; position?: number }
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("pipeline_template_stages")
    .update(updates)
    .eq("id", stageId);
  if (error) throw error;
  revalidatePath("/settings/pipelines");
}

export async function archiveTemplateStage(stageId: string): Promise<void> {
  const admin = createAdminClient();

  // Fetch the stage to check it exists and get template_id
  const { data: stage } = await admin
    .from("pipeline_template_stages")
    .select("template_id, is_won, is_lost")
    .eq("id", stageId)
    .single();
  if (!stage) throw new Error("Stage not found");

  // Don't let users archive the last won or last lost stage
  if (stage.is_won || stage.is_lost) {
    const field = stage.is_won ? "is_won" : "is_lost";
    const { count } = await admin
      .from("pipeline_template_stages")
      .select("id", { count: "exact", head: true })
      .eq("template_id", stage.template_id)
      .eq(field, true)
      .eq("is_archived", false);
    if ((count ?? 0) <= 1) {
      throw new Error(
        `Cannot remove the only ${stage.is_won ? "Won" : "Lost"} stage. Add another first.`
      );
    }
  }

  const { error } = await admin
    .from("pipeline_template_stages")
    .update({ is_archived: true })
    .eq("id", stageId);
  if (error) throw error;

  revalidatePath("/settings/pipelines");
}

export async function reorderTemplateStages(
  templateId: string,
  orderedStageIds: string[]
): Promise<void> {
  const companyId = await getActiveCompanyId();
  const admin = createAdminClient();

  // Verify ownership
  const { data: tmpl } = await admin
    .from("pipeline_templates")
    .select("id")
    .eq("id", templateId)
    .eq("company_id", companyId)
    .single();
  if (!tmpl) throw new Error("Template not found");

  // Update positions in order
  await Promise.all(
    orderedStageIds.map((id, index) =>
      admin
        .from("pipeline_template_stages")
        .update({ position: index })
        .eq("id", id)
        .eq("template_id", templateId)
    )
  );

  revalidatePath("/settings/pipelines");
}
