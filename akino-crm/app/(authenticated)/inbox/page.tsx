import { listThreads, type InboxFilter } from "./actions";
import { InboxView } from "./inbox-view";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const tab = (sp.tab as InboxFilter) ?? "primary";
  const threads = await listThreads(tab);

  return <InboxView initialThreads={threads} initialTab={tab} initialThreadId={sp.t ?? null} />;
}
