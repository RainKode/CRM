"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Deal, Lead, DeletedFolder } from "@/lib/types";

function bust() {
  revalidatePath("/trash");
  revalidatePath("/pipeline");
  revalidatePath("/folders");
}

export type TrashedLead = Lead & { folder_name: string | null };

export async function getTrashedDeals(): Promise<Deal[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb.rpc("list_deleted_deals", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function getTrashedLeads(): Promise<TrashedLead[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb.rpc("list_deleted_leads", {
    p_company_id: companyId,
  });
  if (error) throw error;
  const leads = (data ?? []) as Lead[];
  if (leads.length === 0) return [];

  const folderIds = Array.from(new Set(leads.map((l) => l.folder_id)));
  const { data: folders } = await sb
    .from("folders")
    .select("id, name")
    .in("id", folderIds);
  const nameById = new Map(
    (folders ?? []).map((f) => [f.id as string, f.name as string | null])
  );
  return leads.map((l) => ({ ...l, folder_name: nameById.get(l.folder_id) ?? null }));
}

export async function getDeletedFolders(): Promise<DeletedFolder[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb.rpc("list_deleted_folders", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data ?? []) as DeletedFolder[];
}

export async function restoreDeal(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("restore_deal", { p_id: id });
  if (error) throw error;
  bust();
}

export async function restoreLead(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("restore_lead", { p_id: id });
  if (error) throw error;
  bust();
}

export async function restoreDeletedFolder(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("restore_folder", { p_id: id });
  if (error) throw error;
  bust();
}

export async function purgeDeal(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("purge_deleted_deal", { p_id: id });
  if (error) throw error;
  bust();
}

export async function purgeLead(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("purge_deleted_lead", { p_id: id });
  if (error) throw error;
  bust();
}

export async function purgeDeletedFolder(id: string) {
  const sb = await createClient();
  const { error } = await sb.rpc("purge_deleted_folder", { p_id: id });
  if (error) throw error;
  bust();
}

export async function emptyTrash() {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { error } = await sb.rpc("empty_trash", { p_company_id: companyId });
  if (error) throw error;
  bust();
}
