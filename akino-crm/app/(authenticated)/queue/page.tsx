import { getQueueItems } from "./actions";
import { QueueView } from "./queue-view";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const items = await getQueueItems();
  return <QueueView initialItems={items} />;
}
