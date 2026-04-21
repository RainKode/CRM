"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveCompanyId } from "@/app/(authenticated)/actions";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SequenceStep = {
  id: string;
  sequence_id: string;
  step_order: number;
  wait_days: number;
  template_id: string | null;
  subject_override: string | null;
  body_html_override: string | null;
  condition: "always" | "no_reply" | "no_open";
};

export type Sequence = {
  id: string;
  name: string;
  description: string | null;
  track_opens: boolean;
  track_clicks: boolean;
  created_at: string;
  steps: SequenceStep[];
};

export type SequenceSummary = Omit<Sequence, "steps"> & { step_count: number };

export type Enrollment = {
  id: string;
  sequence_id: string;
  sequence_name: string;
  deal_id: string;
  status: "active" | "paused" | "completed" | "cancelled" | "replied";
  current_step: number;
  next_send_at: string | null;
  enrolled_at: string;
  paused_at: string | null;
  completed_at: string | null;
};

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

export async function listSequences(): Promise<SequenceSummary[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data, error } = await sb
    .from("email_sequences")
    .select("id, name, description, track_opens, track_clicks, created_at, email_sequence_steps(count)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    track_opens: (r.track_opens as boolean) ?? true,
    track_clicks: (r.track_clicks as boolean) ?? true,
    created_at: r.created_at as string,
    step_count: (r as { email_sequence_steps?: [{ count: number }] }).email_sequence_steps?.[0]?.count ?? 0,
  }));
}

export async function getSequence(id: string): Promise<Sequence | null> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data, error } = await sb
    .from("email_sequences")
    .select(
      `id, name, description, track_opens, track_clicks, created_at,
       email_sequence_steps ( id, sequence_id, step_order, wait_days, template_id,
         subject_override, body_html_override, condition )`,
    )
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error || !data) return null;

  const steps = ((data as { email_sequence_steps?: SequenceStep[] }).email_sequence_steps ?? []).sort(
    (a, b) => a.step_order - b.step_order,
  );
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
    track_opens: (data.track_opens as boolean) ?? true,
    track_clicks: (data.track_clicks as boolean) ?? true,
    created_at: data.created_at as string,
    steps,
  };
}

export async function createSequence(
  name: string,
  description?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data, error } = await sb
    .from("email_sequences")
    .insert({ company_id: companyId, name, description: description ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/sequences");
  return { ok: true, id: data.id as string };
}

export async function updateSequence(
  id: string,
  patch: Partial<Pick<Sequence, "name" | "description" | "track_opens" | "track_clicks">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { error } = await sb
    .from("email_sequences")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/sequences");
  return { ok: true };
}

export async function deleteSequence(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { error } = await sb
    .from("email_sequences")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/sequences");
  return { ok: true };
}

// ─── Steps CRUD ──────────────────────────────────────────────────────────────

export async function addStep(
  sequenceId: string,
  step: Omit<SequenceStep, "id" | "sequence_id">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("email_sequence_steps")
    .insert({ sequence_id: sequenceId, ...step })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

export async function updateStep(
  stepId: string,
  patch: Partial<Omit<SequenceStep, "id" | "sequence_id">>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("email_sequence_steps")
    .update(patch)
    .eq("id", stepId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteStep(
  stepId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { error } = await sb.from("email_sequence_steps").delete().eq("id", stepId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export async function enrollDeal(
  sequenceId: string,
  dealId: string,
  fromAccountId?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  // Prevent duplicate active/paused enrollments (DB partial unique index handles this too).
  const { data: existing } = await sb
    .from("email_sequence_enrollments")
    .select("id, status")
    .eq("sequence_id", sequenceId)
    .eq("deal_id", dealId)
    .in("status", ["active", "paused"])
    .maybeSingle();

  if (existing) return { ok: false, error: "Deal is already enrolled in this sequence." };

  // First step's wait_days = 0 means send "now-ish".
  const { data: firstStep } = await sb
    .from("email_sequence_steps")
    .select("wait_days")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const waitDays = (firstStep?.wait_days as number | null) ?? 0;
  const next = new Date(Date.now() + waitDays * 24 * 3600 * 1000).toISOString();

  const { data, error } = await sb
    .from("email_sequence_enrollments")
    .insert({
      sequence_id: sequenceId,
      deal_id: dealId,
      company_id: companyId,
      from_account_id: fromAccountId ?? null,
      status: "active",
      current_step: 0,
      next_send_at: next,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

export async function pauseEnrollment(
  enrollmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("email_sequence_enrollments")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resumeEnrollment(
  enrollmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("email_sequence_enrollments")
    .update({ status: "active", paused_at: null })
    .eq("id", enrollmentId)
    .eq("status", "paused");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cancelEnrollment(
  enrollmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("email_sequence_enrollments")
    .update({ status: "cancelled" })
    .eq("id", enrollmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listEnrollmentsForDeal(dealId: string): Promise<Enrollment[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("email_sequence_enrollments")
    .select(
      "id, sequence_id, deal_id, status, current_step, next_send_at, enrolled_at, paused_at, completed_at, email_sequences(name)",
    )
    .eq("deal_id", dealId)
    .order("enrolled_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    sequence_id: r.sequence_id as string,
    sequence_name: (r as { email_sequences?: { name: string } }).email_sequences?.name ?? "–",
    deal_id: r.deal_id as string,
    status: r.status as Enrollment["status"],
    current_step: (r.current_step as number) ?? 0,
    next_send_at: (r.next_send_at as string | null) ?? null,
    enrolled_at: r.enrolled_at as string,
    paused_at: (r.paused_at as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
  }));
}
