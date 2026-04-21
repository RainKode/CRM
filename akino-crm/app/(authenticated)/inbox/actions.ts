"use server";

import { createClient, getActiveCompanyId } from "@/lib/supabase/server";

export type InboxFilter = "primary" | "unassigned" | "sent" | "all";

export type InboxThread = {
  id: string;
  subject: string | null;
  participants: string[];
  last_message_at: string | null;
  last_message_snippet: string | null;
  unread_count: number;
  is_waiting_on_them: boolean;
  awaiting_since: string | null;
  deal_id: string | null;
  deal_name: string | null;
  deal_company: string | null;
};

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  snippet: string | null;
  sent_at: string | null;
  received_at: string | null;
  has_attachments: boolean;
  is_read: boolean;
};

export type ThreadDetail = {
  id: string;
  subject: string | null;
  participants: string[];
  deal_id: string | null;
  deal_name: string | null;
  lead_id: string | null;
  messages: ThreadMessage[];
};

export async function listThreads(filter: InboxFilter = "primary"): Promise<InboxThread[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  let q = sb
    .from("email_threads")
    .select(
      `id, subject, participants, last_message_at, last_message_snippet,
       unread_count, is_waiting_on_them, awaiting_since, deal_id,
       deals:deal_id ( contact_name, company )`,
    )
    .eq("company_id", companyId)
    .neq("status", "archived")
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (filter === "primary") q = q.not("deal_id", "is", null);
  if (filter === "unassigned") q = q.is("deal_id", null);
  // 'sent' and 'all' are resolved by client-side filter for now; we still
  // load all threads of the company.

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => {
    const deals = (r as { deals?: { contact_name?: string; company?: string } }).deals;
    return {
      id: r.id as string,
      subject: (r.subject as string | null) ?? null,
      participants: (r.participants as string[]) ?? [],
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_snippet: (r.last_message_snippet as string | null) ?? null,
      unread_count: (r.unread_count as number) ?? 0,
      is_waiting_on_them: !!r.is_waiting_on_them,
      awaiting_since: (r.awaiting_since as string | null) ?? null,
      deal_id: (r.deal_id as string | null) ?? null,
      deal_name: deals?.contact_name ?? null,
      deal_company: deals?.company ?? null,
    };
  });
}

export async function getThread(threadId: string): Promise<ThreadDetail | null> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data: thread, error: terr } = await sb
    .from("email_threads")
    .select(
      `id, subject, participants, deal_id, lead_id,
       deals:deal_id ( contact_name )`,
    )
    .eq("id", threadId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (terr) throw terr;
  if (!thread) return null;

  const { data: messages, error: merr } = await sb
    .from("email_messages")
    .select(
      `id, direction, from_address, from_name, to_addresses, cc_addresses,
       subject, body_html, body_text, snippet, sent_at, received_at,
       has_attachments, is_read`,
    )
    .eq("thread_id", threadId)
    .eq("company_id", companyId)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .order("received_at", { ascending: true, nullsFirst: true });

  if (merr) throw merr;

  return {
    id: thread.id as string,
    subject: (thread.subject as string | null) ?? null,
    participants: (thread.participants as string[]) ?? [],
    deal_id: (thread.deal_id as string | null) ?? null,
    deal_name:
      (thread as { deals?: { contact_name?: string } }).deals?.contact_name ?? null,
    lead_id: (thread.lead_id as string | null) ?? null,
    messages: (messages ?? []) as ThreadMessage[],
  };
}

export async function markThreadRead(threadId: string): Promise<void> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  await sb
    .from("email_messages")
    .update({ is_read: true })
    .eq("thread_id", threadId)
    .eq("company_id", companyId)
    .eq("is_read", false);

  await sb
    .from("email_threads")
    .update({ unread_count: 0 })
    .eq("id", threadId)
    .eq("company_id", companyId);
}

export async function getUnreadCount(): Promise<number> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { count } = await sb
    .from("email_threads")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", companyId)
    .gt("unread_count", 0);
  return count ?? 0;
}
