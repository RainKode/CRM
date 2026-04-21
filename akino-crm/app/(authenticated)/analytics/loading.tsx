export default function AnalyticsLoading() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-8 py-6 space-y-6">
        <div className="h-8 w-40 rounded-xl bg-(--color-surface-3) animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-(--color-surface-3) animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-56 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          <div className="h-56 rounded-2xl bg-(--color-surface-3) animate-pulse" />
        </div>
      </div>
    </div>
  );
}
