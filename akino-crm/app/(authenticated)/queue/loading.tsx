export default function QueueLoading() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-8 py-6 space-y-4">
        <div className="h-8 w-36 rounded-xl bg-(--color-surface-3) animate-pulse" />
        <div className="h-12 rounded-xl bg-(--color-surface-3) animate-pulse" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-(--color-surface-3) animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
