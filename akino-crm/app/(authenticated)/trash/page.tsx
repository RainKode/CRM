import { getDeletedFolders, getTrashedDeals, getTrashedLeads } from "./actions";
import { TrashView } from "./trash-view";

export default async function TrashPage() {
  const [deals, leads, folders] = await Promise.all([
    getTrashedDeals(),
    getTrashedLeads(),
    getDeletedFolders(),
  ]);
  return <TrashView initialDeals={deals} initialLeads={leads} initialFolders={folders} />;
}
