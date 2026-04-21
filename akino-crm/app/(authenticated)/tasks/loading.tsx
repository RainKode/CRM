export default function TasksLoading() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-24 rounded-xl bg-(--color-surface-3) animate-pulse" />
          <div className="h-9 w-32 rounded-full bg-(--color-surface-3) animate-pulse" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
