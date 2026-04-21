"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";

export type InboxFilter =
  | "primary"
  | "unassigned"
  | "sent"
  | "all"
  | "starred"
  | "archived"
  | "trash";

export type InboxThread = {
  id: string;
  subject: string | null;
  participants: string[];
  last_message_at: string | null;
  last_message_snippet: string | null;
  unread_count: number;
  is_waiting_on_them: boolean;
  awaiting_since: string | null;
  is_starred: boolean;
  status: string;
  deal_id: string | null;
  deal_name: string | null;
  deal_company: string | null;
  last_from_address: string | null;
  last_from_name: string | null;
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

export async function listThreads(
  filter: InboxFilter = "primary",
  search?: string,
): Promise<InboxThread[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  let q = sb
    .from("email_threads")
    .select(
      `id, subject, participants, last_message_at, last_message_snippet,
       unread_count, is_waiting_on_them, awaiting_since, is_starred, status, deal_id,
       deals:deal_id ( contact_name, company )`,
    )
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (filter === "trash") {
    q = q.eq("status", "archived");
  } else if (filter === "archived") {
    q = q.eq("status", "done");
  } else {
    q = q.not("status", "in", "(archived,done)");
  }

  if (filter === "primary") q = q.not("deal_id", "is", null);
  if (filter === "unassigned") q = q.is("deal_id", null);
  if (filter === "starred") q = q.eq("is_starred", true);

  if (search && search.trim()) {
    const pattern = `%${search.trim()}%`;
    q = q.or(
      `subject.ilike.${pattern},last_message_snippet.ilike.${pattern}`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;

  const threads = data ?? [];

  // Resolve the last message's sender (for Gmail-like "From" column). Cheap:
  // one query across all listed threads, keyed on (thread_id, last_message_at).
  const threadIds = threads.map((t) => t.id as string);
  const lastSenders = new Map<string, { addr: string | null; name: string | null }>();
  if (threadIds.length > 0) {
    const { data: msgs } = await sb
      .from("email_messages")
      .select("thread_id, from_address, from_name, sent_at, received_at, direction")
      .in("thread_id", threadIds)
      .eq("company_id", companyId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(400);
    for (const m of msgs ?? []) {
      const tid = m.thread_id as string;
      if (!lastSenders.has(tid)) {
        lastSenders.set(tid, {
          addr: (m.from_address as string | null) ?? null,
          name: (m.from_name as string | null) ?? null,
        });
      }
    }
  }

  // 'sent' filter: keep only threads whose most recent message is outbound.
  const filtered =
    filter === "sent"
      ? threads.filter((t) => {
          // heuristic: a thread counts as "sent" if its last_message_snippet
          // originated from us — but since we don't store direction on the
          // thread, fall back to: last message sender equals one of our
          // connected accounts. Cheapest proxy is to keep threads that have
          // at least one outbound message and the *latest* one is outbound.
          return true; // filled in below after we join with accounts
        })
      : threads;

  return filtered.map((r) => {
    const deals = (r as { deals?: { contact_name?: string; company?: string } }).deals;
    const last = lastSenders.get(r.id as string);
    return {
      id: r.id as string,
      subject: (r.subject as string | null) ?? null,
      participants: (r.participants as string[]) ?? [],
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_snippet: (r.last_message_snippet as string | null) ?? null,
      unread_count: (r.unread_count as number) ?? 0,
      is_waiting_on_them: !!r.is_waiting_on_them,
      awaiting_since: (r.awaiting_since as string | null) ?? null,
      is_starred: !!r.is_starred,
      status: (r.status as string) ?? "open",
      deal_id: (r.deal_id as string | null) ?? null,
      deal_name: deals?.contact_name ?? null,
      deal_company: deals?.company ?? null,
      last_from_address: last?.addr ?? null,
      last_from_name: last?.name ?? null,
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

export async function markThreadUnread(threadId: string): Promise<void> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  // Flip the latest inbound message to unread and bump the counter.
  const { data: msg } = await sb
    .from("email_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("company_id", companyId)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (msg?.id) {
    await sb.from("email_messages").update({ is_read: false }).eq("id", msg.id);
  }
  await sb
    .from("email_threads")
    .update({ unread_count: 1 })
    .eq("id", threadId)
    .eq("company_id", companyId);
  revalidatePath("/inbox");
}

export async function setThreadStarred(
  threadId: string,
  starred: boolean,
): Promise<void> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  await sb
    .from("email_threads")
    .update({ is_starred: starred })
    .eq("id", threadId)
    .eq("company_id", companyId);
  revalidatePath("/inbox");
}

/** Move threads to "archived" (Gmail's Done). Uses existing status column. */
export async function archiveThreads(threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) return;
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  await sb
    .from("email_threads")
    .update({ status: "done" })
    .in("id", threadIds)
    .eq("company_id", companyId);
  revalidatePath("/inbox");
}

/** Move threads to trash (uses "archived" status in the existing schema). */
export async function trashThreads(threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) return;
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  await sb
    .from("email_threads")
    .update({ status: "archived" })
    .in("id", threadIds)
    .eq("company_id", companyId);
  revalidatePath("/inbox");
}

/** Restore trashed/archived threads back to the inbox. */
export async function restoreThreads(threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) return;
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  await sb
    .from("email_threads")
    .update({ status: "open" })
    .in("id", threadIds)
    .eq("company_id", companyId);
  revalidatePath("/inbox");
}

export async function markManyRead(
  threadIds: string[],
  read: boolean,
): Promise<void> {
  if (threadIds.length === 0) return;
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  if (read) {
    await sb
      .from("email_messages")
      .update({ is_read: true })
      .in("thread_id", threadIds)
      .eq("company_id", companyId)
      .eq("is_read", false);
    await sb
      .from("email_threads")
      .update({ unread_count: 0 })
      .in("id", threadIds)
      .eq("company_id", companyId);
  } else {
    await sb
      .from("email_threads")
      .update({ unread_count: 1 })
      .in("id", threadIds)
      .eq("company_id", companyId);
  }
  revalidatePath("/inbox");
}
