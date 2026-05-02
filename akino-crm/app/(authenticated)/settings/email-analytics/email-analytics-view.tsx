"use client";

import { BarChart3, Mail, MousePointerClick, Reply, Eye } from "lucide-react";

type Totals = {
  sent: number;
  opens: number;
  clicks: number;
  opened: number;
  clicked: number;
  threads: number;
  replied: number;
};

type UserRow = { from: string; sent: number; opens: number; clicks: number; opened: number };
type TemplateRow = { id: string; name: string; sent: number; opens: number; clicks: number; opened: number };
type DailyRow = { date: string; count: number };

export function EmailAnalyticsView({
  totals,
  byUser,
  byTemplate,
  daily,
}: {
  totals: Totals;
  byUser: UserRow[];
  byTemplate: TemplateRow[];
  daily: DailyRow[];
}) {
  const maxDaily = Math.max(1, ...daily.map((d) => d.count));
  const openRate = totals.sent ? Math.round((totals.opened / totals.sent) * 100) : 0;
  const clickRate = totals.sent ? Math.round((totals.clicked / totals.sent) * 100) : 0;
  const replyRate = totals.threads ? Math.round((totals.replied / totals.threads) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-(--color-fg) mb-2">Email analytics</h1>
        <p className="text-sm text-(--color-fg-muted)">Last 30 days · outbound only</p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi icon={<Mail className="h-4 w-4" />} label="Sent" value={totals.sent} />
        <Kpi icon={<Eye className="h-4 w-4" />} label="Open rate" value={`${openRate}%`} sub={`${totals.opened}/${totals.sent}`} />
        <Kpi icon={<MousePointerClick className="h-4 w-4" />} label="Click rate" value={`${clickRate}%`} sub={`${totals.clicked}/${totals.sent}`} />
        <Kpi icon={<Reply className="h-4 w-4" />} label="Reply rate" value={`${replyRate}%`} sub={`${totals.replied}/${totals.threads}`} />
      </div>

      {/* Daily chart */}
      <section className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)  p-6 mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Sends per day
        </h2>
        <div className="flex items-end gap-1 h-32">
          {daily.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
              <div
                className="w-full rounded-t bg-(--color-blue)/60 group-hover:bg-(--color-accent) transition-colors"
                style={{ height: `${(d.count / maxDaily) * 100}%` }}
                title={`${d.date}: ${d.count}`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-(--color-fg-subtle)">
          <span>{daily[0]?.date}</span>
          <span>{daily[daily.length - 1]?.date}</span>
        </div>
      </section>

      {/* Leaderboards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Leaderboard
          title="Top senders"
          rows={byUser.slice(0, 10).map((u) => ({
            label: u.from,
            sent: u.sent,
            rate: u.sent ? Math.round((u.opened / u.sent) * 100) : 0,
          }))}
          rateLabel="Open rate"
        />
        <Leaderboard
          title="Template performance"
          rows={byTemplate.slice(0, 10).map((t) => ({
            label: t.name,
            sent: t.sent,
            rate: t.sent ? Math.round((t.opened / t.sent) * 100) : 0,
          }))}
          rateLabel="Open rate"
        />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)  p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--color-fg-subtle) mb-2">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-black text-(--color-fg)">{value}</div>
      {sub && <div className="text-xs text-(--color-fg-subtle) mt-1">{sub}</div>}
    </div>
  );
}

function Leaderboard({
  title,
  rows,
  rateLabel,
}: {
  title: string;
  rows: Array<{ label: string; sent: number; rate: number }>;
  rateLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-(--color-border) bg-(--color-surface-1)  p-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted) py-6 text-center">No data in the last 30 days</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 rounded-xl bg-(--color-surface-2) px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-(--color-fg) truncate">{r.label}</p>
                <p className="text-xs text-(--color-fg-subtle)">{r.sent} sent · {rateLabel} {r.rate}%</p>
              </div>
              <div className="w-24 h-1.5 rounded-full bg-(--color-surface-3) overflow-hidden">
                <div className="h-full bg-(--color-accent)" style={{ width: `${r.rate}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
