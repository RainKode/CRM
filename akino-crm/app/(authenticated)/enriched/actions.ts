"use server";

import { createClient } from "@/lib/supabase/server";
import type { Lead, Folder } from "@/lib/types";

export type EnrichedLead = Lead & { folder_name: string };

export async function getEnrichedLeads(opts?: {
  folderId?: string;
  minRating?: number;
  maxRating?: number;
  search?: string;
}): Promise<EnrichedLead[]> {
  const sb = await createClient();

  let q = sb
    .from("leads")
    .select("*, folders!inner(name)")
    .eq("status", "enriched")
    .order("quality_rating", { ascending: false, nullsFirst: false });

  if (opts?.folderId) q = q.eq("folder_id", opts.folderId);
  if (opts?.minRating != null) q = q.gte("quality_rating", opts.minRating);
  if (opts?.maxRating != null) q = q.lte("quality_rating", opts.maxRating);
  if (opts?.search) {
    q = q.or(
      `name.ilike.%${opts.search}%,email.ilike.%${opts.search}%,company.ilike.%${opts.search}%`
    );
  }

  const { data, error } = await q.limit(500);
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const folders = row.folders as { name: string } | null;
    const { folders: _, ...lead } = row;
    return { ...lead, folder_name: folders?.name ?? "Unknown" } as EnrichedLead;
  });
}

export async function getFoldersWithEnriched(): Promise<
  { id: string; name: string; count: number }[]
> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("leads")
    .select("folder_id, folders!inner(name)")
    .eq("status", "enriched");
  if (error) throw error;

  const map = new Map<string, { name: string; count: number }>();
  for (const row of data ?? []) {
    const folderId = (row as Record<string, unknown>).folder_id as string;
    const folderName = ((row as Record<string, unknown>).folders as { name: string })?.name ?? "Unknown";
    const existing = map.get(folderId);
    if (existing) {
      existing.count++;
    } else {
      map.set(folderId, { name: folderName, count: 1 });
    }
  }

  return Array.from(map.entries()).map(([id, { name, count }]) => ({
    id,
    name,
    count,
  }));
}
