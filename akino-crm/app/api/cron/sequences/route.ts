import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/unipile/cron-auth";
import { sendEmailAndPersist } from "@/lib/unipile/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every 15 minutes: advance any active sequence enrollment whose next step is
 * due. We halt on 'replied' enrollments (email trigger flips deal.email_status
 * to 'replied' and we detect that here). Supports step condition=no_reply.
 */
export async function GET(req: NextRequest) {
  const unauth = authorizeCron(req);
  if (unauth) return unauth;

  const sb = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await sb
    .from("email_sequence_enrollments")
    .select(`
      id, sequence_id, deal_id, lead_id, current_step, status, next_send_at,
      sequence:email_sequences ( id, company_id, is_active, name )
    `)
    .eq("status", "active")
    .lte("next_send_at", now)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let failed = 0;

  for (const e of due ?? []) {
    try {
      // Deref joined sequence (array or object depending on version)
      const seqRaw = e.sequence as unknown;
      const seq = Array.isArray(seqRaw) ? seqRaw[0] : seqRaw;
      if (!seq || !seq.is_active) {
        await sb.from("email_sequence_enrollments").update({ status: "paused" }).eq("id", e.id as string);
        continue;
      }

      // Reply-halt: check the deal's current email_status
      const { data: deal } = await sb
        .from("deals")
        .select("id, email_status, name, owner_id")
        .eq("id", e.deal_id as string)
        .single();

      if (!deal) {
        await sb.from("email_sequence_enrollments").update({ status: "completed" }).eq("id", e.id as string);
        continue;
      }

      if (deal.email_status === "replied") {
        await sb.from("email_sequence_enrollments").update({ status: "replied" }).eq("id", e.id as string);
        continue;
      }

      const nextPos = ((e.current_step as number) ?? 0) + 1;
      const { data: step } = await sb
        .from("email_sequence_steps")
        .select("id, position, wait_days, template_id, condition")
        .eq("sequence_id", (seq as { id: string }).id)
        .eq("position", nextPos)
        .maybeSingle();

      if (!step) {
        await sb.from("email_sequence_enrollments").update({ status: "completed" }).eq("id", e.id as string);
        continue;
      }

      // Load template
      const { data: tmpl } = await sb
        .from("email_templates")
        .select("id, subject, body_html")
        .eq("id", step.template_id as string)
        .single();
      if (!tmpl) throw new Error("template missing");

      // Resolve lead email
      const { data: lead } = await sb
        .from("leads")
        .select("id, email, full_name")
        .eq("id", e.lead_id as string)
        .maybeSingle();
      if (!lead?.email) {
        await sb.from("email_sequence_enrollments").update({ status: "paused" }).eq("id", e.id as string);
        continue;
      }

      // Sender: the deal owner's primary mailbox
      const { data: acct } = await sb
        .from("email_accounts")
        .select("id, unipile_account_id, email_address, user_id")
        .eq("company_id", (seq as { company_id: string }).company_id)
        .eq("user_id", deal.owner_id as string)
        .eq("status", "connected")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!acct) {
        await sb.from("email_sequence_enrollments").update({ status: "paused" }).eq("id", e.id as string);
        continue;
      }

      const subject = renderVars(tmpl.subject as string, { lead_name: lead.full_name ?? "", deal_name: deal.name ?? "" });
      const body = renderVars(tmpl.body_html as string, { lead_name: lead.full_name ?? "", deal_name: deal.name ?? "" });

      await sendEmailAndPersist(sb, {
        accountId: acct.id as string,
        unipileAccountId: acct.unipile_account_id as string,
        fromAddress: acct.email_address as string,
        companyId: (seq as { company_id: string }).company_id,
        userId: acct.user_id as string,
        to: [lead.email as string],
        subject,
        bodyHtml: body,
        dealId: e.deal_id as string,
        leadId: e.lead_id as string,
        templateId: tmpl.id as string,
        trackOpens: true,
        trackClicks: true,
      });

      // Schedule the next step
      const { data: nextStep } = await sb
        .from("email_sequence_steps")
        .select("wait_days, position")
        .eq("sequence_id", (seq as { id: string }).id)
        .eq("position", nextPos + 1)
        .maybeSingle();

      if (nextStep) {
        const waitDays = (nextStep.wait_days as number) ?? 0;
        const nextSendAt = new Date(Date.now() + waitDays * 24 * 60 * 60 * 1000).toISOString();
        await sb
          .from("email_sequence_enrollments")
          .update({ current_step: nextPos, next_send_at: nextSendAt, updated_at: new Date().toISOString() })
          .eq("id", e.id as string);
      } else {
        await sb
          .from("email_sequence_enrollments")
          .update({ current_step: nextPos, next_send_at: null, status: "completed" })
          .eq("id", e.id as string);
      }

      processed += 1;
    } catch (err) {
      failed += 1;
      console.error("[cron/sequences]", err);
    }
  }

  await sb.from("email_cron_runs").insert({
    job_name: "sequences",
    processed,
    failed,
    note: `${due?.length ?? 0} due`,
  });

  return NextResponse.json({ ok: true, processed, failed });
}

export const POST = GET;

function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}
