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
};

export type ComposeResult =
  | { ok: true; message_id: string; thread_id: string }
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
