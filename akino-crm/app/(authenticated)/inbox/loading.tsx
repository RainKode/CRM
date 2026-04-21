export default function InboxLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 shrink-0 border-r border-(--color-card-border) flex flex-col">
        <div className="h-16 px-4 flex items-center border-b border-(--color-card-border)">
          <div className="h-8 w-full rounded-xl bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-(--color-card-border) px-6 flex items-center gap-4">
          <div className="h-6 w-48 rounded-lg bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
