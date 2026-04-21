import { getTrashedDeals, getTrashedLeads } from "./actions";
import { TrashView } from "./trash-view";

export default async function TrashPage() {
  const [deals, leads] = await Promise.all([
    getTrashedDeals(),
    getTrashedLeads(),
  ]);
  return <TrashView initialDeals={deals} initialLeads={leads} />;
}
