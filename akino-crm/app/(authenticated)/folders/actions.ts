"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Folder, FolderWithCounts } from "@/lib/types";

// ----- Queries -------------------------------------------------------

export async function getFolders(): Promise<FolderWithCounts[]> {
  const sb = await createClient();

  // Aggregate counts in a single query
  const { data, error } = await sb.rpc("get_folders_with_counts");

  if (error) {
    // Fallback: simple query if RPC not yet deployed
    const { data: folders, error: fErr } = await sb
      .from("folders")
      .select("*")
      .order("created_at", { ascending: false });
    if (fErr) throw fErr;
    return (folders as Folder[]).map((f) => ({
      ...f,
      lead_count: 0,
      enriched_count: 0,
      pipeline_count: 0,
    }));
  }

  return data as FolderWithCounts[];
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
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("folders")
    .insert({ name, description: description ?? null, created_by: user.id })
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
