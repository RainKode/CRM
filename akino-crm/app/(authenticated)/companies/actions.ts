"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

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

  // Create company
  const { data: company, error } = await sb
    .from("companies")
    .insert({ name: trimmedName, created_by: user.id })
    .select()
    .single();
  if (error) throw error;

  // Add creator as admin member
  await sb.from("company_members").insert({
    company_id: company.id,
    user_id: user.id,
    role: "admin",
    is_default: false,
  });

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

  // Create a default pipeline
  const { data: pipeline } = await sb
    .from("pipelines")
    .insert({
      name: "Default",
      company_id: company.id,
      is_default: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (pipeline) {
    for (const stage of defaultStages) {
      await sb.from("pipeline_stages").insert({
        ...stage,
        pipeline_id: pipeline.id,
      });
    }
  }

  // Create default loss reasons
  const defaultLossReasons = [
    { label: "No Response", position: 0 },
    { label: "Budget", position: 1 },
    { label: "Wrong Contact", position: 2 },
    { label: "Went with Competitor", position: 3 },
    { label: "Not Interested", position: 4 },
    { label: "Other", position: 5 },
  ];
  for (const lr of defaultLossReasons) {
    await sb.from("loss_reasons").insert({
      ...lr,
      company_id: company.id,
    });
  }

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
