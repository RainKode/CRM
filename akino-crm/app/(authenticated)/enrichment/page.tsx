import { getBatchesGroupedByFolder } from "./actions";
import { EnrichmentView } from "./enrichment-view";

export default async function EnrichmentPage() {
  const groups = await getBatchesGroupedByFolder();
  return <EnrichmentView groups={groups} />;
}
