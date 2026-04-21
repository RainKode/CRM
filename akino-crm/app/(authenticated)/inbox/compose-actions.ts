"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import { sendEmailAndPersist } from "@/lib/unipile/send";

export type ComposeInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  accountId?: string;         // email_accounts.id — if omitted, first connected account is used
  threadId?: string | null;
  replyToMessageId?: string | null;  // local email_messages.id of the parent (we'll look up unipile_message_id)
  dealId?: string | null;
  leadId?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  templateId?: string | null;
  scheduledSendAt?: string | null;   // ISO — if set, store as 'scheduled' and defer to cron
};

export type ComposeResult =
  | { ok: true; message_id: string; thread_id: string; scheduled?: boolean }
  | { ok: false; error: string };

export async function sendEmail(input: ComposeInput): Promise<ComposeResult> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const companyId = await getActiveCompanyId();
  if (!companyId) return { ok: false, error: "No active company" };

  if (!input.to || input.to.length === 0) {
    return { ok: false, error: "At least one recipient is required" };
  }
  if (!input.subject?.trim()) {
    return { ok: false, error: "Subject is required" };
  }
  if (!input.bodyHtml?.trim()) {
    return { ok: false, error: "Message body is required" };
  }

  // Resolve sending account
  let accountQuery = sb
    .from("email_accounts")
    .select("id, unipile_account_id, email_address, status")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "connected")
    .limit(1);

  if (input.accountId) {
    accountQuery = accountQuery.eq("id", input.accountId);
  }

  const { data: account, error: acctErr } = await accountQuery.maybeSingle();
  if (acctErr) return { ok: false, error: acctErr.message };
  if (!account) {
    return {
      ok: false,
      error: "No connected mailbox. Connect one in Settings → Email.",
    };
  }

  // Resolve reply_to unipile id
  let replyToUnipileMessageId: string | null = null;
  if (input.replyToMessageId) {
    const { data: parent } = await sb
      .from("email_messages")
      .select("unipile_message_id")
      .eq("id", input.replyToMessageId)
      .maybeSingle();
    replyToUnipileMessageId = (parent?.unipile_message_id as string) ?? null;
  }

  // --- Scheduled send branch: persist a 'scheduled' message row and return.
  // The cron at /api/cron/scheduled-sends will call Unipile when it's due.
  if (input.scheduledSendAt) {
    const when = new Date(input.scheduledSendAt);
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return { ok: false, error: "Schedule time must be at least 1 minute in the future" };
    }

    // Create or reuse a thread for the scheduled send
    let threadId = input.threadId ?? null;
    if (!threadId) {
      const participants = Array.from(
        new Set([
          account.email_address.toLowerCase(),
          ...input.to.map((e) => e.toLowerCase()),
          ...(input.cc ?? []).map((e) => e.toLowerCase()),
        ]),
      );
      const { data: thr, error: terr } = await sb
        .from("email_threads")
        .insert({
          company_id: companyId,
          deal_id: input.dealId ?? null,
          lead_id: input.leadId ?? null,
          subject: input.subject,
          participants,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (terr || !thr) return { ok: false, error: terr?.message ?? "Failed to create thread" };
      threadId = thr.id as string;
    }

    const { data: msg, error: merr } = await sb
      .from("email_messages")
      .insert({
        company_id: companyId,
        thread_id: threadId,
        direction: "outbound",
        status: "scheduled",
        scheduled_send_at: when.toISOString(),
        from_address: account.email_address,
        to_addresses: input.to,
        cc_addresses: input.cc ?? [],
        bcc_addresses: input.bcc ?? [],
        subject: input.subject,
        body_html: input.bodyHtml,
        sent_by_user_id: user.id,
        sent_from_account_id: account.id,
        template_id: input.templateId ?? null,
        is_read: true,
      })
      .select("id")
      .single();
    if (merr || !msg) return { ok: false, error: merr?.message ?? "Failed to schedule" };

    revalidatePath("/inbox");
    return { ok: true, scheduled: true, message_id: msg.id as string, thread_id: threadId };
  }

  try {
    const res = await sendEmailAndPersist(sb, {
      accountId: account.id as string,
      unipileAccountId: account.unipile_account_id as string,
      fromAddress: account.email_address as string,
      companyId,
      userId: user.id,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      threadId: input.threadId ?? null,
      replyToUnipileMessageId,
      dealId: input.dealId ?? null,
      leadId: input.leadId ?? null,
      trackOpens: input.trackOpens ?? true,
      trackClicks: input.trackClicks ?? true,
      templateId: input.templateId ?? null,
    });
    revalidatePath("/inbox");
    if (input.dealId) revalidatePath("/pipeline");
    return { ok: true, ...res };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    return { ok: false, error: msg };
  }
}

/** Default sending account for the current user, for the compose UI. */
export async function getPrimaryAccount(): Promise<{
  id: string;
  email_address: string;
} | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const companyId = await getActiveCompanyId();
  if (!companyId) return null;

  const { data } = await sb
    .from("email_accounts")
    .select("id, email_address")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "connected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as { id: string; email_address: string } | null) ?? null;
}

/** Cancel a scheduled send. Only deletes rows still in 'scheduled' status. */
export async function cancelScheduledEmail(
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { error } = await sb
    .from("email_messages")
    .delete()
    .eq("id", messageId)
    .eq("company_id", companyId)
    .eq("status", "scheduled");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export type ScheduledSend = {
  id: string;
  subject: string;
  to_addresses: string[];
  scheduled_send_at: string;
  thread_id: string;
  deal_id: string | null;
};

/** Upcoming scheduled sends for the current company. */
export async function listScheduledSends(): Promise<ScheduledSend[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data, error } = await sb
    .from("email_messages")
    .select("id, subject, to_addresses, scheduled_send_at, thread_id, email_threads!inner(deal_id)")
    .eq("company_id", companyId)
    .eq("status", "scheduled")
    .order("scheduled_send_at", { ascending: true });

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    subject: (r.subject as string) ?? "",
    to_addresses: (r.to_addresses as string[]) ?? [],
    scheduled_send_at: r.scheduled_send_at as string,
    thread_id: r.thread_id as string,
    deal_id: (() => {
      const et = (r as unknown as { email_threads?: { deal_id: string | null } | { deal_id: string | null }[] }).email_threads;
      if (!et) return null;
      if (Array.isArray(et)) return et[0]?.deal_id ?? null;
      return et.deal_id ?? null;
    })(),
  }));
}
