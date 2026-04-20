"use client";

export default function FolderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-(--color-bg) p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <span className="text-2xl">⚠</span>
      </div>
      <h2 className="text-lg font-bold text-(--color-fg)">Something went wrong</h2>
      <p className="max-w-md text-center text-sm text-(--color-fg-muted)">
        {error.message || "An unexpected error occurred while loading this folder."}
        {error.digest && (
          <span className="mt-1 block text-xs text-(--color-fg-subtle)">
            Digest: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-(--color-accent) px-5 py-2 text-sm font-medium text-(--color-accent-fg) hover:opacity-90 transition-opacity"
      >
        Try Again
      </button>
    </div>
  );
}
