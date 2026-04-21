export default function FolderDetailLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 h-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-5 w-20 rounded-lg bg-(--color-surface-3) animate-pulse" />
          <div className="h-5 w-5 rounded bg-(--color-surface-3) animate-pulse" />
          <div className="h-6 w-40 rounded-lg bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 rounded-full bg-(--color-surface-3) animate-pulse" />
          <div className="h-9 w-28 rounded-full bg-(--color-surface-3) animate-pulse" />
        </div>
      </div>
      <div className="flex-1 px-8 pb-8 overflow-hidden">
        <div className="h-10 rounded-xl bg-(--color-surface-3) animate-pulse mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
