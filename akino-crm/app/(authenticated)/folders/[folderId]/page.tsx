import { getFolder } from "../actions";
import { getFieldDefinitions, getLeads, getLeadCount } from "./actions";
import { FolderDetail } from "./folder-detail";
import { notFound } from "next/navigation";

const PAGE_SIZE = 50;

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  let folder;
  try {
    folder = await getFolder(folderId);
  } catch {
    folder = null;
  }
  if (!folder) notFound();

  const [fields, leads, totalCount] = await Promise.all([
    getFieldDefinitions(folderId).catch(() => [] as never[]),
    getLeads(folderId, { limit: PAGE_SIZE }).catch(() => [] as never[]),
    getLeadCount(folderId).catch(() => 0),
  ]);

  return <FolderDetail folder={folder} fields={fields} initialLeads={leads} totalCount={totalCount} />;
}
