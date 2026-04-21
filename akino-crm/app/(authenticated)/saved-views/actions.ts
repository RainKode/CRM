"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";

export type SavedViewScope = "pipeline" | "folder";

export interface SavedView {
  id: string;
  company_id: string;
  owner_id: string;
  scope: SavedViewScope;
  scope_ref: string | null;
  name: string;
  filters: Record<string, unknown>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export async function listSavedViews(
  scope: SavedViewScope,
  scopeRef: string | null
): Promise<SavedView[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  let q = sb
    .from("saved_views")
    .select("*")
    .eq("company_id", companyId)
    .eq("scope", scope)
    .order("name", { ascending: true });

  // Support "global within scope" (scope_ref = null) OR a specific reference.
  if (scopeRef) q = q.or(`scope_ref.eq.${scopeRef},scope_ref.is.null`);
  else q = q.is("scope_ref", null);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedView[];
}

export async function createSavedView(input: {
  scope: SavedViewScope;
  scope_ref: string | null;
  name: string;
  filters: Record<string, unknown>;
  is_shared?: boolean;
}): Promise<SavedView> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("saved_views")
    .insert({
      company_id: companyId,
      owner_id: userId,
      scope: input.scope,
      scope_ref: input.scope_ref,
      name: input.name.trim(),
      filters: input.filters,
      is_shared: input.is_shared ?? false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  bust(input.scope, input.scope_ref);
  return data as SavedView;
}

export async function updateSavedView(
  id: string,
  patch: Partial<Pick<SavedView, "name" | "filters" | "is_shared">>
): Promise<void> {
  const sb = await createClient();

  // Read scope so we can bust the right path.
  const { data: existing } = await sb
    .from("saved_views")
    .select("scope,scope_ref")
    .eq("id", id)
    .single();

  const { error } = await sb.from("saved_views").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  if (existing)
    bust(
      existing.scope as SavedViewScope,
      (existing.scope_ref as string | null) ?? null
    );
}

export async function deleteSavedView(id: string): Promise<void> {
  const sb = await createClient();

  const { data: existing } = await sb
    .from("saved_views")
    .select("scope,scope_ref")
    .eq("id", id)
    .single();

  const { error } = await sb.from("saved_views").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (existing)
    bust(
      existing.scope as SavedViewScope,
      (existing.scope_ref as string | null) ?? null
    );
}

function bust(scope: SavedViewScope, scopeRef: string | null) {
  if (scope === "pipeline") {
    revalidatePath("/pipeline");
    if (scopeRef) revalidatePath(`/pipeline/folder/${scopeRef}`);
  } else {
    revalidatePath("/folders");
    if (scopeRef) revalidatePath(`/folders/${scopeRef}`);
  }
}
