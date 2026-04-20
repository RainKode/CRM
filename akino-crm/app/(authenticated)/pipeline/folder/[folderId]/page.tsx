import { getDealsForFolder, getStagesForFolder, getLossReasons, getPipelines, getFolderName } from "../../actions";
import { FolderPipelineView } from "./folder-pipeline-view";

export default async function FolderPipelinePage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  const [deals, stages, lossReasons, pipelines, folderName] = await Promise.all([
    getDealsForFolder(folderId),
    getStagesForFolder(folderId),
    getLossReasons(),
    getPipelines(),
    getFolderName(folderId),
  ]);

  // Get folder-specific pipelines
  const folderPipelines = pipelines.filter((p) => p.folder_id === folderId);

  return (
    <FolderPipelineView
      folderId={folderId}
      folderName={folderName}
      pipelines={folderPipelines}
      stages={stages}
      initialDeals={deals}
      lossReasons={lossReasons}
    />
  );
}
