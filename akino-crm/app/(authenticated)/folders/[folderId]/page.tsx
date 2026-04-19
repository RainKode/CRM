import { getFolder } from "../actions";
import { getFieldDefinitions } from "./actions";
import { getLeads } from "./actions";
import { FolderDetail } from "./folder-detail";
import { notFound } from "next/navigation";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  const folder = await getFolder(folderId);
  if (!folder) notFound();

  const [fields, leads] = await Promise.all([
    getFieldDefinitions(folderId).catch(() => []),
    getLeads(folderId).catch(() => []),
  ]);

  return <FolderDetail folder={folder} fields={fields} initialLeads={leads} />;
}
