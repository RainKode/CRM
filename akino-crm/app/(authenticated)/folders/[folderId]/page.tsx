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

  let folder;
  try {
    folder = await getFolder(folderId);
  } catch {
    folder = null;
  }
  if (!folder) notFound();

  const [fields, leads] = await Promise.all([
    getFieldDefinitions(folderId).catch(() => [] as never[]),
    getLeads(folderId).catch(() => [] as never[]),
  ]);

  return <FolderDetail folder={folder} fields={fields} initialLeads={leads} />;
}
