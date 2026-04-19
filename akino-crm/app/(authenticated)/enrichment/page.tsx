import { getBatches } from "./actions";
import { EnrichmentView } from "./enrichment-view";

export default async function EnrichmentPage() {
  const batches = await getBatches();
  return <EnrichmentView initialBatches={batches} />;
}
