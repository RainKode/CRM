/**
 * Normalize a Unipile mail into our DB shape + resolve thread + link to a deal.
 *
 * Linking priority (Phase 3 §4):
 *   1. Header match:    in_reply_to / references → existing email_messages.message_id_header
 *   2. Participant match: from/to against leads.email within the account's company
 *   3. Subject heuristic: Re:/Fwd: with matching normalized subject + overlapping participants in last 90d
 *   4. Unmatched → thread left with deal_id = null (goes to Unassigned tray)
 *
 * Idempotent on email_messages.unipile_message_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnipileMail } from "./client";

export type StoredAccountRow = {
  id: string;
  company_id: string;
  user_id: string;
  email_address: string;
  unipile_account_id: string;
};

export type IngestResult = {
  messageId: string;
  threadId: string;
  isNewMessage: boolean;
  isNewThread: boolean;
  dealId: string | null;
  linkReason: "header" | "participant" | "subject" | "manual_rule" | "unassigned";
};

export async function ingestUnipileMail(
  sb: SupabaseClient,
  account: StoredAccountRow,
  mail: UnipileMail,
): Promise<IngestResult | null> {
  const direction = inferDirection(mail, account.email_address);
  const from = mail.from_attendee?.identifier?.toLowerCase() ?? null;
  const to = (mail.to_attendees ?? [])
    .map((a) => a.identifier?.toLowerCase())
    .filter(Boolean) as string[];
  const cc = (mail.cc_attendees ?? [])
    .map((a) => a.identifier?.toLowerCase())
    .filter(Boolean) as string[];
  const bcc = (mail.bcc_attendees ?? [])
    .map((a) => a.identifier?.toLowerCase())
    .filter(Boolean) as string[];

  // Idempotency check
  const { data: existing } = await sb
    .from("email_messages")
    .select("id, thread_id")
    .eq("unipile_message_id", mail.id)
    .maybeSingle();

  if (existing) {
    return {
      messageId: existing.id as string,
      threadId: existing.thread_id as string,
      isNewMessage: false,
      isNewThread: false,
      dealId: null,
      linkReason: "manual_rule",
    };
  }

  // --- Resolve / create thread ---------------------------------------------
  const participants = dedupeEmails([
    from,
    ...to,
    ...cc,
    account.email_address.toLowerCase(),
  ]);

  const resolved = await resolveThread(sb, account, mail, participants);
  let threadId = resolved.threadId;
  let dealId = resolved.dealId;
  let linkReason = resolved.linkReason;
  let isNewThread = false;

  if (!threadId) {
    // Try participant-based deal link
    const match = await linkByParticipant(sb, account.company_id, participants);
    dealId = match.dealId;
    if (match.reason) linkReason = match.reason;

    const { data: inserted, error: threadErr } = await sb
      .from("email_threads")
      .insert({
        company_id: account.company_id,
        account_id: account.id,
        deal_id: dealId,
        lead_id: match.leadId,
        subject: mail.subject ?? null,
        participants,
        unipile_thread_id: mail.thread_id ?? null,
        last_message_at: mail.date ?? new Date().toISOString(),
        last_message_snippet: snippetOf(mail),
      })
      .select("id")
      .single();

    if (threadErr || !inserted) {
      // If unique violation on unipile_thread_id, re-select.
      const { data: again } = await sb
        .from("email_threads")
        .select("id, deal_id")
        .eq("account_id", account.id)
        .eq("unipile_thread_id", mail.thread_id ?? "")
        .maybeSingle();
      if (!again) throw threadErr ?? new Error("Failed to create thread");
      threadId = again.id as string;
      dealId = (again.deal_id as string | null) ?? dealId;
    } else {
      threadId = inserted.id as string;
      isNewThread = true;
    }
  }

  // --- Insert message ------------------------------------------------------
  const payload = {
    company_id: account.company_id,
    thread_id: threadId,
    account_id: account.id,
    unipile_message_id: mail.id,
    direction,
    from_address: from,
    from_name: mail.from_attendee?.display_name ?? null,
    to_addresses: to,
    cc_addresses: cc,
    bcc_addresses: bcc,
    subject: mail.subject ?? null,
    snippet: snippetOf(mail),
    body_text: mail.body_plain ?? null,
    body_html: mail.body ?? null,
    sent_at: direction === "outbound" ? mail.date ?? null : null,
    received_at: direction === "inbound" ? mail.date ?? null : null,
    sent_from_account_id: direction === "outbound" ? account.id : null,
    in_reply_to: mail.in_reply_to ?? null,
    references_header: (mail.references ?? []).join(" ") || null,
    message_id_header: mail.message_id ?? null,
    has_attachments: !!mail.has_attachments,
    is_read: mail.is_read ?? false,
    raw_payload: mail as unknown as Record<string, unknown>,
  };

  const { data: msg, error: msgErr } = await sb
    .from("email_messages")
    .insert(payload)
    .select("id")
    .single();

  if (msgErr || !msg) {
    // Idempotent on duplicate
    const { data: dup } = await sb
      .from("email_messages")
      .select("id")
      .eq("unipile_message_id", mail.id)
      .maybeSingle();
    if (dup) {
      return {
        messageId: dup.id as string,
        threadId: threadId!,
        isNewMessage: false,
        isNewThread,
        dealId,
        linkReason,
      };
    }
    throw msgErr ?? new Error("Failed to insert email_messages");
  }

  // Persist a corresponding activity row if linked to a deal
  if (dealId) {
    await sb.from("activities").insert({
      deal_id: dealId,
      type: direction === "inbound" ? "email_received" : "email_sent",
      summary: mail.subject ?? "(no subject)",
      email_subject: mail.subject ?? null,
      email_message_id: msg.id,
      occurred_at: mail.date ?? new Date().toISOString(),
    });
  }

  return {
    messageId: msg.id as string,
    threadId: threadId!,
    isNewMessage: true,
    isNewThread,
    dealId,
    linkReason,
  };
}

// ---------------------------------------------------------------------------

async function resolveThread(
  sb: SupabaseClient,
  account: StoredAccountRow,
  mail: UnipileMail,
  participants: string[],
): Promise<{
  threadId: string | null;
  dealId: string | null;
  linkReason: IngestResult["linkReason"];
}> {
  // 1a) Provider-normalized thread id
  if (mail.thread_id) {
    const { data } = await sb
      .from("email_threads")
      .select("id, deal_id")
      .eq("account_id", account.id)
      .eq("unipile_thread_id", mail.thread_id)
      .maybeSingle();
    if (data) {
      return {
        threadId: data.id as string,
        dealId: (data.deal_id as string | null) ?? null,
        linkReason: "header",
      };
    }
  }

  // 1b) in_reply_to / references → existing message_id_header
  const candidates: string[] = [];
  if (mail.in_reply_to) candidates.push(mail.in_reply_to);
  if (mail.references) candidates.push(...mail.references);
  if (candidates.length > 0) {
    const { data } = await sb
      .from("email_messages")
      .select("thread_id, email_threads:thread_id ( id, deal_id )")
      .eq("company_id", account.company_id)
      .in("message_id_header", candidates)
      .limit(1)
      .maybeSingle();

    const t = (data as { thread_id?: string; email_threads?: { id: string; deal_id: string | null } } | null)?.email_threads;
    if (t) {
      return { threadId: t.id, dealId: t.deal_id ?? null, linkReason: "header" };
    }
  }

  // 3) Subject heuristic (Re:/Fwd:)
  const norm = normalizeSubject(mail.subject);
  if (norm) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from("email_threads")
      .select("id, deal_id, participants, subject")
      .eq("company_id", account.company_id)
      .gte("last_message_at", ninetyDaysAgo)
      .ilike("subject", `%${norm}%`)
      .overlaps("participants", participants)
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        threadId: data.id as string,
        dealId: (data.deal_id as string | null) ?? null,
        linkReason: "subject",
      };
    }
  }

  return { threadId: null, dealId: null, linkReason: "unassigned" };
}

async function linkByParticipant(
  sb: SupabaseClient,
  companyId: string,
  participants: string[],
): Promise<{ dealId: string | null; leadId: string | null; reason: IngestResult["linkReason"] | null }> {
  const externals = participants.filter((p) => !!p);
  if (externals.length === 0) return { dealId: null, leadId: null, reason: null };

  // Match a lead by email (case-insensitive) inside one of the company's folders
  const { data: lead } = await sb
    .from("leads")
    .select("id, folder_id, folders:folder_id ( company_id )")
    .in("email", externals)
    .limit(50);

  const first = (lead ?? []).find(
    (r) => {
      const rec = r as unknown as { folders?: { company_id: string } | { company_id: string }[] };
      const f = Array.isArray(rec.folders) ? rec.folders[0] : rec.folders;
      return f?.company_id === companyId;
    },
  ) as { id: string } | undefined;

  if (!first) return { dealId: null, leadId: null, reason: null };

  // Newest open deal for this lead
  const { data: deal } = await sb
    .from("deals")
    .select("id")
    .eq("lead_id", first.id)
    .is("won_at", null)
    .is("lost_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    dealId: (deal?.id as string | undefined) ?? null,
    leadId: first.id,
    reason: deal ? "participant" : null,
  };
}

// ---------------------------------------------------------------------------

function inferDirection(mail: UnipileMail, mailbox: string): "inbound" | "outbound" {
  const from = mail.from_attendee?.identifier?.toLowerCase() ?? "";
  if (from && from === mailbox.toLowerCase()) return "outbound";
  const folder = (mail.folder ?? "").toUpperCase();
  if (folder === "SENT" || folder === "DRAFTS") return "outbound";
  return "inbound";
}

function snippetOf(mail: UnipileMail): string | null {
  const plain = mail.body_plain?.trim() ?? "";
  if (plain) return plain.slice(0, 280);
  const html = mail.body ?? "";
  if (!html) return null;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function normalizeSubject(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "").trim().slice(0, 120) || null;
}

function dedupeEmails(xs: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    out.add(x.toLowerCase());
  }
  return Array.from(out);
}
