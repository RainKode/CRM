import { getTeamAnalytics } from "../analytics/actions";
import {
  getActiveCompany,
  listCompanyMembers,
  bootstrapManager,
} from "../companies/actions";
import { isManager } from "@/lib/auth/roles";
import TeamViewClient from "./team-view-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="p-6 text-(--color-fg-muted)">
        Pick a company first to view your team.
      </div>
    );
  }

  // Self-heal: if there are zero managers (e.g. legacy company predating
  // migration A), let the company creator promote themselves.
  await bootstrapManager(company.id).catch(() => {
    /* allowed to fail silently — UI just shows read-only view */
  });

  const [analytics, members, viewerIsManager] = await Promise.all([
    getTeamAnalytics(),
    listCompanyMembers(company.id),
    isManager(company.id),
  ]);

  return (
    <TeamViewClient
      companyId={company.id}
      companyName={company.name}
      analytics={analytics}
      members={members}
      viewerIsManager={viewerIsManager}
    />
  );
}
