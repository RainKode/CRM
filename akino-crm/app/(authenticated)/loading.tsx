export default function DashboardLoading() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-6 space-y-6">
        <div className="py-2 space-y-2">
          <div className="h-10 w-64 rounded-xl bg-(--color-surface-3) animate-pulse" />
          <div className="h-4 w-40 rounded-lg bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="h-20 rounded-2xl bg-(--color-surface-3) animate-pulse" />
        <div className="h-40 rounded-2xl bg-(--color-surface-3) animate-pulse" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 min-w-[140px] h-28 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
