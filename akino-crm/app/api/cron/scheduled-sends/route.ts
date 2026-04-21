import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/unipile/cron-auth";
import { sendEmailAndPersist } from "@/lib/unipile/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauth = authorizeCron(req);
  if (unauth) return unauth;

  const sb = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await sb
    .from("email_messages")
    .select("id, thread_id, subject, body_html, direction, scheduled_send_at, company_id, account_id, template_id, deal_id, lead_id")
    .eq("send_status", "scheduled")
    .eq("direction", "outbound")
    .lte("scheduled_send_at", now)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const row of due ?? []) {
    try {
      // Mark as sending
      await sb.from("email_messages").update({ send_status: "sending" }).eq("id", row.id as string);

      // Look up recipients from the original thread (we stored them there)
      const { data: thread } = await sb
        .from("email_threads")
        .select("id, participants")
        .eq("id", row.thread_id as string)
        .single();

      const { data: account } = await sb
        .from("email_accounts")
        .select("id, unipile_account_id, email_address, user_id, company_id")
        .eq("id", row.account_id as string)
        .single();

      if (!thread || !account) throw new Error("thread or account missing");

      const participants = (thread.participants ?? []) as string[];
      const to = participants.filter((p) => p.toLowerCase() !== (account.email_address as string).toLowerCase());

      // Delete the placeholder row — sendEmailAndPersist creates its own.
      await sb.from("email_messages").delete().eq("id", row.id as string);

      await sendEmailAndPersist(sb, {
        accountId: account.id as string,
        unipileAccountId: account.unipile_account_id as string,
        fromAddress: account.email_address as string,
        companyId: row.company_id as string,
        userId: account.user_id as string,
        to,
        subject: row.subject as string,
        bodyHtml: row.body_html as string,
        threadId: row.thread_id as string,
        dealId: row.deal_id as string | null,
        leadId: row.lead_id as string | null,
        templateId: row.template_id as string | null,
        trackOpens: true,
        trackClicks: true,
      });

      processed += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await sb
        .from("email_messages")
        .update({ send_status: "failed", send_error: msg })
        .eq("id", row.id as string);
      console.error("[cron/scheduled-sends]", msg);
    }
  }

  await sb.from("email_cron_runs").insert({
    job_name: "scheduled-sends",
    processed,
    failed,
    note: `${due?.length ?? 0} due`,
  });

  return NextResponse.json({ ok: true, processed, failed });
}

export const POST = GET;
