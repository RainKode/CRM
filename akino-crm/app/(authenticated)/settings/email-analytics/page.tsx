import { redirect } from "next/navigation";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import { EmailAnalyticsView } from "./email-analytics-view";

export const dynamic = "force-dynamic";

export default async function EmailAnalyticsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const companyId = await getActiveCompanyId();
  if (!companyId) {
    return <EmptyState message="No active workspace" />;
  }

  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Aggregate in parallel
  const [sentRes, tmplRes] = await Promise.all([
    sb
      .from("email_messages")
      .select("id, company_id, direction, opens, clicks, sent_at, from_address, template_id, thread_id, send_status")
      .eq("company_id", companyId)
      .eq("direction", "outbound")
      .eq("send_status", "sent")
      .gte("sent_at", windowStart),
    sb
      .from("email_templates")
      .select("id, name")
      .eq("company_id", companyId),
  ]);

  const messages = (sentRes.data ?? []) as Array<{
    id: string;
    opens: number | null;
    clicks: number | null;
    from_address: string | null;
    template_id: string | null;
    thread_id: string | null;
    sent_at: string | null;
  }>;
  const templates = (tmplRes.data ?? []) as Array<{ id: string; name: string }>;

  // Fetch reply counts: count threads where at least one inbound followed our outbound
  const threadIds = Array.from(new Set(messages.map((m) => m.thread_id).filter(Boolean))) as string[];
  let repliedThreadCount = 0;
  if (threadIds.length > 0) {
    const { count } = await sb
      .from("email_messages")
      .select("thread_id", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .eq("direction", "inbound");
    repliedThreadCount = count ?? 0;
  }

  const totals = {
    sent: messages.length,
    opens: messages.reduce((s, m) => s + (m.opens ?? 0), 0),
    clicks: messages.reduce((s, m) => s + (m.clicks ?? 0), 0),
    opened: messages.filter((m) => (m.opens ?? 0) > 0).length,
    clicked: messages.filter((m) => (m.clicks ?? 0) > 0).length,
    threads: threadIds.length,
    replied: repliedThreadCount,
  };

  // Per-user leaderboard
  const byUser = new Map<string, { from: string; sent: number; opens: number; clicks: number; opened: number }>();
  for (const m of messages) {
    const key = m.from_address ?? "unknown";
    const cur = byUser.get(key) ?? { from: key, sent: 0, opens: 0, clicks: 0, opened: 0 };
    cur.sent += 1;
    cur.opens += m.opens ?? 0;
    cur.clicks += m.clicks ?? 0;
    if ((m.opens ?? 0) > 0) cur.opened += 1;
    byUser.set(key, cur);
  }

  // Per-template leaderboard
  const byTemplate = new Map<string, { id: string; name: string; sent: number; opens: number; clicks: number; opened: number }>();
  const tmplMap = new Map(templates.map((t) => [t.id, t.name]));
  for (const m of messages) {
    if (!m.template_id) continue;
    const name = tmplMap.get(m.template_id) ?? "Untitled";
    const cur = byTemplate.get(m.template_id) ?? { id: m.template_id, name, sent: 0, opens: 0, clicks: 0, opened: 0 };
    cur.sent += 1;
    cur.opens += m.opens ?? 0;
    cur.clicks += m.clicks ?? 0;
    if ((m.opens ?? 0) > 0) cur.opened += 1;
    byTemplate.set(m.template_id, cur);
  }

  // Daily series (30 days)
  const daily = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    daily.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of messages) {
    if (!m.sent_at) continue;
    const k = m.sent_at.slice(0, 10);
    if (daily.has(k)) daily.set(k, (daily.get(k) ?? 0) + 1);
  }

  return (
    <EmailAnalyticsView
      totals={totals}
      byUser={Array.from(byUser.values()).sort((a, b) => b.sent - a.sent)}
      byTemplate={Array.from(byTemplate.values()).sort((a, b) => b.sent - a.sent)}
      daily={Array.from(daily.entries()).map(([date, count]) => ({ date, count }))}
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-12 text-center text-sm text-(--color-fg-muted)">{message}</div>
  );
}
