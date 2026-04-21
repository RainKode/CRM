export default function FoldersLoading() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 rounded-xl bg-(--color-surface-3) animate-pulse" />
          <div className="h-9 w-36 rounded-full bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-2xl bg-(--color-surface-3) animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
