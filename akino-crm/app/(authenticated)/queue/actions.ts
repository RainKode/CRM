"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Task, Activity, Deal } from "@/lib/types";

export type QueueItemKind = "task" | "scheduled_activity" | "follow_up" | "awaiting_reply";

export type QueueItem =
  | {
      kind: "task";
      id: string;
      due_at: string | null;
      title: string;
      subtitle: string | null;
      deal_id: string | null;
      deal_name: string | null;
      overdue: boolean;
    }
  | {
      kind: "scheduled_activity";
      id: string;
      due_at: string;
      title: string;
      subtitle: string | null;
      activity_type: Activity["type"];
      deal_id: string;
      deal_name: string;
      overdue: boolean;
    }
  | {
      kind: "follow_up";
      id: string;
      due_at: string;
      title: string;
      subtitle: string | null;
      deal_id: string;
      deal_name: string;
      overdue: boolean;
    }
  | {
      kind: "awaiting_reply";
      id: string;
      due_at: string;        // last_outbound_at
      title: string;
      subtitle: string | null;
      deal_id: string;
      deal_name: string;
      overdue: boolean;
    };

function bust() {
  revalidatePath("/queue");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/pipeline");
}

// Unified queue: tasks + scheduled activities + deal follow-ups, all due ≤ end-of-today.
// Returns soonest-first. `overdue` flag is set when due_at < startOfToday.
export async function getQueueItems(): Promise<QueueItem[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Parallel fetches — keeps response fast.
  const [tasksRes, activitiesRes, dealsRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id,title,notes,due_at,deal_id")
      .eq("company_id", companyId)
      .is("completed_at", null)
      .not("due_at", "is", null)
      .lte("due_at", endOfToday.toISOString())
      .order("due_at", { ascending: true }),
    sb
      .from("activities")
      .select(
        "id,type,summary,scheduled_at,deal_id,deal:deals!inner(company_id,contact_name,company)"
      )
      .eq("deal.company_id", companyId)
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", endOfToday.toISOString())
      .order("scheduled_at", { ascending: true }),
    sb
      .from("deals")
      .select(
        "id,contact_name,company,follow_up_at,follow_up_note,won_at,lost_at"
      )
      .eq("company_id", companyId)
      .is("won_at", null)
      .is("lost_at", null)
      .not("follow_up_at", "is", null)
      .lte("follow_up_at", endOfToday.toISOString())
      .order("follow_up_at", { ascending: true }),
  ]);

  // If any of the parallel calls errored we surface a readable message.
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);
  if (dealsRes.error) throw new Error(dealsRes.error.message);

  // Pull deal names for tasks linked to deals (one extra round-trip if any).
  const taskDealIds = Array.from(
    new Set(
      (tasksRes.data ?? [])
        .map((t) => t.deal_id)
        .filter((x): x is string => !!x)
    )
  );
  const taskDealNames = new Map<string, string>();
  if (taskDealIds.length) {
    const { data: td } = await sb
      .from("deals")
      .select("id,contact_name,company")
      .in("id", taskDealIds);
    for (const d of td ?? []) {
      taskDealNames.set(d.id, d.company || d.contact_name || "Deal");
    }
  }

  const items: QueueItem[] = [];

  for (const t of tasksRes.data ?? []) {
    items.push({
      kind: "task",
      id: t.id,
      due_at: t.due_at,
      title: t.title,
      subtitle: t.notes ?? null,
      deal_id: t.deal_id ?? null,
      deal_name: t.deal_id ? taskDealNames.get(t.deal_id) ?? null : null,
      overdue: !!t.due_at && new Date(t.due_at) < startOfToday,
    });
  }

  for (const a of activitiesRes.data ?? []) {
    // Supabase joins land either as an object or an array depending on fk cardinality.
    const dealJoin = (a as unknown as {
      deal: { contact_name: string | null; company: string | null } | null;
    }).deal;
    const name = dealJoin?.company || dealJoin?.contact_name || "Deal";
    items.push({
      kind: "scheduled_activity",
      id: a.id,
      due_at: a.scheduled_at!,
      title: a.summary || `${a.type} scheduled`,
      subtitle: null,
      activity_type: a.type as Activity["type"],
      deal_id: a.deal_id,
      deal_name: name,
      overdue: new Date(a.scheduled_at!) < startOfToday,
    });
  }

  for (const d of dealsRes.data ?? []) {
    const name = d.company || d.contact_name || "Deal";
    items.push({
      kind: "follow_up",
      id: d.id,
      due_at: d.follow_up_at!,
      title: `Follow up with ${name}`,
      subtitle: d.follow_up_note ?? null,
      deal_id: d.id,
      deal_name: name,
      overdue: new Date(d.follow_up_at!) < startOfToday,
    });
  }

  // Awaiting-reply deals: last_outbound > 3 days ago and no reply yet.
  // These are a softer signal than follow_up_at, so we fetch separately.
  const cutoff3d = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: awaiting } = await sb
    .from("deals")
    .select(
      "id, contact_name, company, last_outbound_at, email_status",
    )
    .eq("company_id", companyId)
    .eq("email_status", "awaiting_reply")
    .is("won_at", null)
    .is("lost_at", null)
    .not("last_outbound_at", "is", null)
    .lte("last_outbound_at", cutoff3d)
    .order("last_outbound_at", { ascending: true })
    .limit(50);

  for (const d of awaiting ?? []) {
    const name = d.company || d.contact_name || "Deal";
    const last = d.last_outbound_at as string;
    const days = Math.floor(
      (Date.now() - new Date(last).getTime()) / (24 * 3600 * 1000),
    );
    items.push({
      kind: "awaiting_reply",
      id: d.id,
      due_at: last,
      title: `Bump ${name}`,
      subtitle: `No reply for ${days}d · last sent ${new Date(last).toLocaleDateString()}`,
      deal_id: d.id,
      deal_name: name,
      overdue: days > 7,
    });
  }

  // Soonest first; overdue naturally lands first due to older timestamps.
  items.sort(
    (a, b) =>
      new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime()
  );

  return items;
}

// Count for the sidebar / dashboard badge.
export async function getQueueCount(): Promise<number> {
  const items = await getQueueItems();
  return items.length;
}

// ─── Mutations ────────────────────────────────────────────────────

// Mark any queue item done. For tasks this completes the task; for scheduled
// activities it flips status to "done" + stamps occurred_at; for follow-ups it
// clears the deal's follow_up_at.
export async function completeQueueItem(
  kind: QueueItemKind,
  id: string
): Promise<void> {
  const sb = await createClient();
  const nowIso = new Date().toISOString();

  if (kind === "task") {
    const { error } = await sb
      .from("tasks")
      .update({ completed_at: nowIso })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else if (kind === "scheduled_activity") {
    const { error } = await sb
      .from("activities")
      .update({ status: "done", occurred_at: nowIso })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else if (kind === "follow_up") {
    const { error } = await sb
      .from("deals")
      .update({ follow_up_at: null, follow_up_note: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  bust();
}

// Snooze = push due date forward by N days. Works for all three kinds.
export async function snoozeQueueItem(
  kind: QueueItemKind,
  id: string,
  days: number
): Promise<void> {
  const sb = await createClient();
  const target = new Date();
  target.setDate(target.getDate() + days);
  // Keep time-of-day = 9am local so snoozed items surface in the morning.
  target.setHours(9, 0, 0, 0);
  const iso = target.toISOString();

  if (kind === "task") {
    const { error } = await sb
      .from("tasks")
      .update({ due_at: iso })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else if (kind === "scheduled_activity") {
    const { error } = await sb
      .from("activities")
      .update({ scheduled_at: iso, occurred_at: iso })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else if (kind === "follow_up") {
    const { error } = await sb
      .from("deals")
      .update({ follow_up_at: iso })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  bust();
}
