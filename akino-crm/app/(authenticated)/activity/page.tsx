import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { ActivityLogEntry } from "@/lib/types";
import { ActivityView } from "./activity-view";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const category = params.category ?? "all";
  const cursor = params.cursor ?? null;

  let query = sb
    .from("activity_log")
    .select("*")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (category !== "all") {
    query = query.eq("category", category);
  }

  if (cursor) {
    query = query.lt("occurred_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const activities = (data ?? []) as ActivityLogEntry[];
  const nextCursor =
    activities.length === 50 ? activities[activities.length - 1].occurred_at : null;

  return (
    <ActivityView
      activities={activities}
      category={category}
      nextCursor={nextCursor}
    />
  );
}
