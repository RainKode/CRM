"use client";

import { useEffect } from "react";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-500 text-2xl font-bold">
        !
      </div>
      <h2 className="text-xl font-bold text-(--color-fg)">
        Something went wrong
      </h2>
      <p className="text-sm text-(--color-fg-muted) max-w-md text-center">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-full bg-(--color-accent) px-6 py-2.5 text-sm font-bold text-(--color-accent-fg) transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
