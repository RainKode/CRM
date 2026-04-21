"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

function bust() {
  revalidatePath("/tasks");
  revalidatePath("/"); // dashboard
}

// ─── Reads ────────────────────────────────────────────────────────────

export type TaskFilter = "open" | "completed" | "overdue" | "today" | "upcoming" | "all";

export async function getTasks(filter: TaskFilter = "open"): Promise<Task[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  let q = sb
    .from("tasks")
    .select("*")
    .eq("company_id", companyId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const now = new Date().toISOString();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  switch (filter) {
    case "open":
      q = q.is("completed_at", null);
      break;
    case "completed":
      q = q.not("completed_at", "is", null);
      break;
    case "overdue":
      q = q.is("completed_at", null).lt("due_at", now);
      break;
    case "today":
      q = q
        .is("completed_at", null)
        .gte("due_at", startOfDay.toISOString())
        .lte("due_at", endOfDay.toISOString());
      break;
    case "upcoming":
      q = q
        .is("completed_at", null)
        .gt("due_at", endOfDay.toISOString())
        .lte("due_at", weekAhead.toISOString());
      break;
    case "all":
      break;
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function getTaskCounts(): Promise<{
  open: number;
  overdue: number;
  today: number;
}> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const now = new Date().toISOString();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [openRes, overdueRes, todayRes] = await Promise.all([
    sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("completed_at", null),
    sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("completed_at", null)
      .lt("due_at", now),
    sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("completed_at", null)
      .gte("due_at", startOfDay.toISOString())
      .lte("due_at", endOfDay.toISOString()),
  ]);

  return {
    open: openRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
    today: todayRes.count ?? 0,
  };
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function createTask(input: {
  title: string;
  notes?: string | null;
  due_at?: string | null;
  deal_id?: string | null;
  lead_id?: string | null;
  assigned_to?: string | null;
}): Promise<Task> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");

  const { data, error } = await sb
    .from("tasks")
    .insert({
      company_id: companyId,
      title,
      notes: input.notes ?? null,
      due_at: input.due_at ?? null,
      deal_id: input.deal_id ?? null,
      lead_id: input.lead_id ?? null,
      assigned_to: input.assigned_to ?? user?.id ?? null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  bust();
  return data as Task;
}

export async function updateTask(
  id: string,
  patch: {
    title?: string;
    notes?: string | null;
    due_at?: string | null;
    assigned_to?: string | null;
  }
): Promise<Task> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  bust();
  return data as Task;
}

export async function toggleTaskComplete(id: string, completed: boolean): Promise<Task> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  bust();
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
  bust();
}
