import { getBatchLeads, getEnrichmentFields } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EnrichmentQueue } from "./enrichment-queue";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;

  const sb = await createClient();
  const { data: batch } = await sb
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) notFound();

  const [batchLeads, fields] = await Promise.all([
    getBatchLeads(batchId),
    getEnrichmentFields(batch.folder_id),
  ]);

  return (
    <EnrichmentQueue
      batch={batch}
      batchLeads={batchLeads}
      enrichmentFields={fields}
    />
  );
}
