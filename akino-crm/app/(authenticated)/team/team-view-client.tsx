"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Settings2, RefreshCw } from "lucide-react";
import type { TeamAnalytics, TeamMemberSummary } from "../analytics/actions";
import type { CompanyMemberWithProfile } from "../companies/actions";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTeamChannel } from "@/lib/realtime/use-team-channel";
import { ManageMembersModal } from "./manage-members-modal";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function TeamViewClient({
  companyId,
  companyName,
  analytics,
  members,
  viewerIsManager,
}: {
  companyId: string;
  companyName: string;
  analytics: TeamAnalytics;
  members: CompanyMemberWithProfile[];
  viewerIsManager: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Debounce-ish: any realtime nudge schedules a single refresh.
  const [refreshScheduled, setRefreshScheduled] = useState(false);
  useTeamChannel(companyId, () => {
    if (refreshScheduled) return;
    setRefreshScheduled(true);
    setTimeout(() => {
      setRefreshScheduled(false);
      startTransition(() => router.refresh());
    }, 1500);
  });

  const allCards: TeamMemberSummary[] = [
    ...analytics.members,
    analytics.unassigned,
  ];

  const totals = allCards.reduce(
    (acc, m) => {
      acc.deals_open += m.deals_open;
      acc.deals_won += m.deals_won;
      acc.in_closing += m.in_closing_count;
      acc.open_value += m.open_value;
      acc.batches += m.batches_owned;
      return acc;
    },
    { deals_open: 0, deals_won: 0, in_closing: 0, open_value: 0, batches: 0 }
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-(--color-blue)" />
            <h1 className="text-2xl font-bold tracking-tight">Team</h1>
            {(isPending || refreshing || refreshScheduled) && (
              <span className="text-xs text-(--color-fg-muted) flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" /> live
              </span>
            )}
          </div>
          <p className="text-sm text-(--color-fg-muted) mt-1">
            Master view for {companyName}. Workload, ownership, and pipeline
            stage breakdown across every member.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              startTransition(() => {
                router.refresh();
                setTimeout(() => setRefreshing(false), 600);
              });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          {viewerIsManager && (
            <Button size="sm" onClick={() => setManageOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" /> Manage members
            </Button>
          )}
        </div>
      </header>

      {/* Aggregate strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Open deals" value={totals.deals_open.toString()} />
        <Stat label="In closing" value={totals.in_closing.toString()} highlight />
        <Stat label="Won" value={totals.deals_won.toString()} />
        <Stat label="Open value" value={formatCurrency(totals.open_value)} />
        <Stat label="Active batches" value={totals.batches.toString()} />
      </div>

      {/* Member grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {allCards.map((m) => (
          <MemberCard key={m.user_id ?? "__unassigned__"} member={m} />
        ))}
        {allCards.length === 0 && (
          <div className="col-span-full text-(--color-fg-muted) text-sm">
            No members yet.
          </div>
        )}
      </div>

      {viewerIsManager && (
        <ManageMembersModal
          open={manageOpen}
          onOpenChange={setManageOpen}
          companyId={companyId}
          members={members}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border border-(--color-border) bg-(--color-surface-1) p-3" +
        (highlight ? " ring-1 ring-(--color-accent)/40" : "")
      }
    >
      <div className="text-[11px] uppercase tracking-wider text-(--color-fg-muted)">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function MemberCard({ member }: { member: TeamMemberSummary }) {
  const isUnassigned = member.user_id == null;
  const display =
    member.full_name ??
    member.email ??
    (isUnassigned ? "Unassigned" : "Unknown member");

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface-1) p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Avatar
          size="lg"
          unassigned={isUnassigned}
          userId={member.user_id ?? undefined}
          name={member.full_name}
          email={member.email}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold truncate">{display}</div>
            <RoleBadge role={member.role} />
          </div>
          {member.email && !isUnassigned && (
            <div className="text-xs text-(--color-fg-muted) truncate">
              {member.email}
            </div>
          )}
          <div className="text-[11px] text-(--color-fg-muted) mt-0.5">
            Last activity · {relativeTime(member.last_activity_at)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Mini label="Open" value={member.deals_open} />
        <Mini label="Closing" value={member.in_closing_count} highlight />
        <Mini label="Won" value={member.deals_won} />
        <Mini label="Lost" value={member.deals_lost} />
      </div>

      <div className="flex items-center justify-between text-xs text-(--color-fg-muted)">
        <span>{member.batches_owned} batches</span>
        <span>{member.leads_owned} leads</span>
        <span>{formatCurrency(member.open_value)} open</span>
      </div>

      {member.by_stage.length > 0 && (
        <div className="pt-2 border-t border-(--color-border) space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-(--color-fg-muted)">
            Stage breakdown
          </div>
          <div className="flex flex-wrap gap-1.5">
            {member.by_stage
              .slice()
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
              .map((s) => (
                <Badge key={s.stage_id} tone="neutral">
                  {s.stage_name} · {s.count}
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md bg-(--color-surface-2) py-1.5" +
        (highlight ? " ring-1 ring-(--color-accent)/40" : "")
      }
    >
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-(--color-fg-muted)">
        {label}
      </div>
    </div>
  );
}
