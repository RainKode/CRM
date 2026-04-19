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
  const [folder, fields, leads] = await Promise.all([
    getFolder(folderId),
    getFieldDefinitions(folderId),
    getLeads(folderId),
  ]);

  if (!folder) notFound();

  return <FolderDetail folder={folder} fields={fields} initialLeads={leads} />;
}
