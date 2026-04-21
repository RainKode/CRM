"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { Folder, FolderWithCounts } from "@/lib/types";

// ----- Queries -------------------------------------------------------

export async function getFolders(): Promise<FolderWithCounts[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  // Aggregate counts in a single query
  const { data, error } = await sb.rpc("get_folders_with_counts");

  if (error) {
    console.error("[getFolders] RPC get_folders_with_counts failed:", error);
    // Fallback: simple query if RPC not yet deployed
    const { data: folders, error: fErr } = await sb
      .from("folders")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (fErr) {
      console.error("[getFolders] fallback folders query failed:", fErr);
      throw new Error(`Folders query failed: ${fErr.message}`);
    }
    return (folders ?? []).map((f) => ({
      ...(f as Folder),
      lead_count: 0,
      enriched_count: 0,
      pipeline_count: 0,
    }));
  }

  // Filter by company_id (RPC may not filter)
  return ((data ?? []) as FolderWithCounts[]).filter(
    (f) => f.company_id === companyId,
  );
}

export async function getFolder(id: string): Promise<Folder | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("folders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Folder;
}

// ----- Mutations -----------------------------------------------------

export async function createFolder(name: string, description?: string) {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("folders")
    .insert({ name, description: description ?? null, created_by: user.id, company_id: companyId })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/folders");
  return data as Folder;
}

export async function renameFolder(id: string, name: string) {
  const sb = await createClient();
  const { error } = await sb.from("folders").update({ name }).eq("id", id);
  if (error) throw error;
  revalidatePath("/folders");
}

export async function deleteFolder(id: string) {
  const sb = await createClient();
  const { error } = await sb.from("folders").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/folders");
}

export async function archiveFolder(id: string, archived: boolean) {
  const sb = await createClient();
  const { error } = await sb
    .from("folders")
    .update({ is_archived: archived })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/folders");
}
