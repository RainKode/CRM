import { getEnrichedLeads, getFoldersWithEnriched } from "./actions";
import { EnrichedView } from "./enriched-view";

export default async function EnrichedPage() {
  const [leads, folders] = await Promise.all([
    getEnrichedLeads(),
    getFoldersWithEnriched(),
  ]);

  return <EnrichedView initialLeads={leads} folders={folders} />;
}
