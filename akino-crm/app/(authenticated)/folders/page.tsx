import { getFolders } from "./actions";
import { FolderList } from "./folder-list";

export default async function FoldersPage() {
  const folders = await getFolders();

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-16 max-w-7xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <h2 className="text-4xl md:text-[40px] font-bold text-(--color-fg) tracking-tight mb-2">
              Data Batches
            </h2>
            <p className="text-(--color-fg-muted) font-medium text-lg">
              Manage and enrich your organized lead segments.
            </p>
          </div>
        </div>

        {/* List */}
        <FolderList initialFolders={folders} />
      </div>
    </div>
  );
}
