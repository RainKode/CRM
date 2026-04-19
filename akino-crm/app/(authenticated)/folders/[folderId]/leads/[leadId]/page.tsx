import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getFieldDefinitions } from "../../actions";
import { LeadDetail } from "./lead-detail";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ folderId: string; leadId: string }>;
}) {
  const { folderId, leadId } = await params;

  const sb = await createClient();

  const { data: lead } = await sb
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) notFound();

  const { data: folder } = await sb
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .single();

  if (!folder) notFound();

  const fields = await getFieldDefinitions(folderId);

  // Get batch history for this lead
  const { data: batchHistory } = await sb
    .from("batch_leads")
    .select("*, batch:batches(*)")
    .eq("lead_id", leadId)
    .order("added_at", { ascending: false });

  return (
    <LeadDetail
      lead={lead}
      folder={folder}
      fields={fields}
      batchHistory={batchHistory ?? []}
    />
  );
}
