"use server";

import { createClient, getActiveCompanyId } from "@/lib/supabase/server";

export type SearchResultKind = "folder" | "deal" | "batch" | "lead";

export type SearchResult = {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle?: string;
  href: string;
};

/**
 * Lightweight cross-entity search for the command palette.
 * Runs 4 parallel queries scoped to the active company and returns
 * up to `perKindLimit` rows per kind. Matches are ILIKE-based; when
 * the query is empty we return the most-recent items in each kind.
 *
 * Server action so we re-use Supabase RLS (company scoping) instead
 * of having to re-implement authorisation on the client.
 */
export async function searchEverything(
  rawQuery: string,
  perKindLimit = 6
): Promise<SearchResult[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  if (!companyId) return [];

  const q = rawQuery.trim();
  const pattern = q ? `%${q}%` : null;

  // Folder IDs for lead scoping (RLS covers it too, but this lets us
  // filter leads by company_id via their folder without an extra join).
  const { data: companyFolders } = await sb
    .from("folders")
    .select("id")
    .eq("company_id", companyId);
  const folderIds = (companyFolders ?? []).map((f) => f.id);

  // Run all 4 queries in parallel.
  const [foldersQ, dealsQ, batchesQ, leadsQ] = await Promise.all([
    // Folders
    (() => {
      let builder = sb
        .from("folders")
        .select("id, name, description")
        .eq("company_id", companyId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(perKindLimit);
      if (pattern) builder = builder.ilike("name", pattern);
      return builder;
    })(),

    // Deals (open only — most useful in a jump-to)
    (() => {
      let builder = sb
        .from("deals")
        .select("id, contact_name, company, email")
        .eq("company_id", companyId)
        .is("won_at", null)
        .is("lost_at", null)
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(perKindLimit);
      if (pattern) {
        builder = builder.or(
          `contact_name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`
        );
      }
      return builder;
    })(),

    // Batches
    (() => {
      if (folderIds.length === 0) {
        return Promise.resolve({ data: [] as { id: string; name: string; folder_id: string }[], error: null });
      }
      let builder = sb
        .from("batches")
        .select("id, name, folder_id")
        .in("folder_id", folderIds)
        .order("created_at", { ascending: false })
        .limit(perKindLimit);
      if (pattern) builder = builder.ilike("name", pattern);
      return builder;
    })(),

    // Leads (only when there's a query; otherwise too noisy)
    (() => {
      if (!pattern || folderIds.length === 0) {
        return Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null; company: string | null; folder_id: string }[], error: null });
      }
      return sb
        .from("leads")
        .select("id, name, email, company, folder_id")
        .in("folder_id", folderIds)
        .or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
        .limit(perKindLimit);
    })(),
  ]);

  const results: SearchResult[] = [];

  for (const f of foldersQ.data ?? []) {
    results.push({
      id: `folder-${f.id}`,
      kind: "folder",
      title: f.name,
      subtitle: f.description ?? undefined,
      href: `/folders/${f.id}`,
    });
  }

  for (const d of dealsQ.data ?? []) {
    const subtitle = [d.company, d.email].filter(Boolean).join(" · ");
    results.push({
      id: `deal-${d.id}`,
      kind: "deal",
      title: d.contact_name || d.email || "Untitled deal",
      subtitle: subtitle || undefined,
      href: `/pipeline?deal=${d.id}`,
    });
  }

  for (const b of batchesQ.data ?? []) {
    results.push({
      id: `batch-${b.id}`,
      kind: "batch",
      title: b.name,
      href: `/enrichment/${b.id}`,
    });
  }

  for (const l of leadsQ.data ?? []) {
    const title = l.name || l.email || l.company || "Untitled lead";
    const subtitle = [l.company, l.email].filter(Boolean).join(" · ");
    results.push({
      id: `lead-${l.id}`,
      kind: "lead",
      title,
      subtitle: subtitle || undefined,
      href: `/folders/${l.folder_id}?lead=${l.id}`,
    });
  }

  return results;
}
