"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import { requireManager, RoleError } from "@/lib/auth/roles";
import type { Company, CompanyMemberRole } from "@/lib/types";

export interface CompanyMemberWithProfile {
  user_id: string;
  full_name: string | null;
  email: string;
  role: CompanyMemberRole;
  is_default: boolean;
  joined_at: string;
}

export async function getMyCompanies(): Promise<Company[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) return [];

  const companyIds = memberships.map((m) => m.company_id);
  const { data: companies, error } = await sb
    .from("companies")
    .select("*")
    .in("id", companyIds)
    .order("name");
  if (error) throw error;
  return companies as Company[];
}

export async function getActiveCompany(): Promise<Company | null> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();
  if (error) return null;
  return data as Company;
}

export async function switchCompany(companyId: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify user is a member
  const { data: membership } = await sb
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .single();
  if (!membership) throw new Error("Not a member of this company");

  const cookieStore = await cookies();
  cookieStore.set("active_company_id", companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath("/");
}

export async function createCompany(name: string): Promise<Company> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Company name is required");

  // Use admin client for bootstrapping — the creator needs to set up their
  // own admin membership and seed data, which is a chicken-and-egg problem
  // with RLS (can't be admin before the membership row exists).
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Create company
  const { data: company, error } = await admin
    .from("companies")
    .insert({ name: trimmedName, created_by: user.id })
    .select()
    .single();
  if (error) throw error;

  // Add creator as member (manager — this is the master of the new company)
  const { error: memberError } = await admin.from("company_members").insert({
    company_id: company.id,
    user_id: user.id,
    is_default: false,
    role: "manager",
  });
  if (memberError) throw memberError;

  // Add all other existing users to this company
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id")
    .neq("id", user.id);
  if (allProfiles && allProfiles.length > 0) {
    const otherMembers = allProfiles.map((p) => ({
      company_id: company.id,
      user_id: p.id,
      is_default: false,
    }));
    await admin.from("company_members").insert(otherMembers);
  }

  // Create default pipeline stages for the new company
  const defaultStages = [
    { name: "New", position: 0, is_won: false, is_lost: false },
    { name: "Contacted", position: 1, is_won: false, is_lost: false },
    { name: "Responded", position: 2, is_won: false, is_lost: false },
    { name: "Meeting Booked", position: 3, is_won: false, is_lost: false },
    { name: "Proposal Sent", position: 4, is_won: false, is_lost: false },
    { name: "Negotiation", position: 5, is_won: false, is_lost: false },
    { name: "Won", position: 6, is_won: true, is_lost: false },
    { name: "Lost", position: 7, is_won: false, is_lost: true },
  ];

  // 1. Create the company-scoped template
  const { data: template, error: templateError } = await admin
    .from("pipeline_templates")
    .insert({
      company_id: company.id,
      name: "Default",
      is_default: true,
      created_by: user.id,
    })
    .select()
    .single();
  if (templateError) throw templateError;

  const templateStageRows = defaultStages.map((s) => ({
    ...s,
    template_id: template.id,
  }));
  const { error: templateStagesError } = await admin
    .from("pipeline_template_stages")
    .insert(templateStageRows);
  if (templateStagesError) throw templateStagesError;

  // 2. Clone template into the initial "Default" pipeline instance
  const { data: pipeline, error: pipelineError } = await admin
    .from("pipelines")
    .insert({
      name: "Default",
      company_id: company.id,
      template_id: template.id,
      is_default: true,
      created_by: user.id,
    })
    .select()
    .single();
  if (pipelineError) throw pipelineError;

  const stageRows = defaultStages.map((s) => ({ ...s, pipeline_id: pipeline.id }));
  const { error: stagesError } = await admin.from("pipeline_stages").insert(stageRows);
  if (stagesError) throw stagesError;

  // Create default loss reasons
  const lossRows = [
    { label: "No Response", position: 0 },
    { label: "Budget", position: 1 },
    { label: "Wrong Contact", position: 2 },
    { label: "Went with Competitor", position: 3 },
    { label: "Not Interested", position: 4 },
    { label: "Other", position: 5 },
  ].map((lr) => ({ ...lr, company_id: company.id }));
  const { error: lrError } = await admin.from("loss_reasons").insert(lossRows);
  if (lrError) throw lrError;

  // Switch to new company
  const cookieStore = await cookies();
  cookieStore.set("active_company_id", company.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/");
  return company as Company;
}

// =====================================================================
// Member management (collaborative pipelines feature)
// =====================================================================

/**
 * Returns all members of the given company joined to their profile,
 * with managers listed first, then executives. Uses the user (RLS)
 * client — `is_member_of_company` policy gates visibility.
 */
export async function listCompanyMembers(
  companyId?: string
): Promise<CompanyMemberWithProfile[]> {
  const sb = await createClient();
  const cid = companyId ?? (await getActiveCompanyId());
  if (!cid) return [];

  const { data, error } = await sb
    .from("company_members")
    .select(
      "company_id, user_id, role, is_default, joined_at, profiles!inner(full_name, email)"
    )
    .eq("company_id", cid);
  if (error) throw error;

  type Row = {
    user_id: string;
    role: CompanyMemberRole;
    is_default: boolean;
    joined_at: string;
    profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[];
  };

  const rows = (data as Row[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      user_id: r.user_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? "",
      role: r.role,
      is_default: r.is_default,
      joined_at: r.joined_at,
    } satisfies CompanyMemberWithProfile;
  });

  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === "manager" ? -1 : 1;
    return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
  });

  return rows;
}

/**
 * Manager-only. Promote/demote a member. Forbids demoting the last
 * manager so a company never ends up role-less.
 */
export async function setMemberRole(
  companyId: string,
  userId: string,
  role: CompanyMemberRole
): Promise<void> {
  await requireManager(companyId);
  const sb = await createClient();

  // Last-manager guard
  if (role === "executive") {
    const { count } = await sb
      .from("company_members")
      .select("user_id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("role", "manager");
    if ((count ?? 0) <= 1) {
      throw new RoleError(
        "Cannot demote the last manager. Promote someone else first."
      );
    }
  }

  const { error } = await sb
    .from("company_members")
    .update({ role })
    .eq("company_id", companyId)
    .eq("user_id", userId);
  if (error) throw error;

  revalidatePath("/team");
}

/**
 * Self-healing: if the company has zero managers (e.g. the original
 * creator was deleted, or roles drifted), allow a member to bootstrap
 * themselves into the manager role. Only succeeds when:
 *  - the caller is currently a member, AND
 *  - either `companies.created_by` is the caller, OR `created_by` is null.
 * Idempotent: noop if a manager already exists.
 */
export async function bootstrapManager(companyId: string): Promise<{ promoted: boolean }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await sb
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "manager")
    .limit(1)
    .maybeSingle();
  if (existing) return { promoted: false };

  const { data: company } = await sb
    .from("companies")
    .select("created_by")
    .eq("id", companyId)
    .single();
  if (!company) throw new Error("Company not found");

  const allowed =
    company.created_by === user.id || company.created_by === null;
  if (!allowed) throw new RoleError("Not eligible to bootstrap manager");

  const { error } = await sb
    .from("company_members")
    .update({ role: "manager" })
    .eq("company_id", companyId)
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/team");
  return { promoted: true };
}
