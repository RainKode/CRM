export default function PipelineLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 md:px-12 h-24 shrink-0">
        <div className="h-8 w-32 rounded-xl bg-(--color-surface-3) animate-pulse" />
        <div className="flex items-center gap-4">
          <div className="h-9 w-32 rounded-full bg-(--color-surface-3) animate-pulse" />
          <div className="h-9 w-24 rounded-full bg-(--color-surface-3) animate-pulse" />
        </div>
      </div>
      <div className="flex gap-6 px-8 md:px-12 pb-8 overflow-x-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-[320px] shrink-0 rounded-2xl p-4 border border-(--color-border) bg-(--color-surface-2)/30"
          >
            <div className="h-5 w-24 rounded-lg bg-(--color-surface-3) animate-pulse mb-6" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-28 rounded-xl bg-(--color-surface-3) animate-pulse mb-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
