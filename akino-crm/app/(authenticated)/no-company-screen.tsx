"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Clock, LogOut } from "lucide-react";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

export function NoCompanyScreen({ email }: { email: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const { url, key } = getSupabasePublicConfig();
    const sb = createBrowserClient(url, key);
    await sb.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Clock className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-(--color-fg)">
            Waiting for access
          </h1>
          <p className="text-sm text-(--color-fg-muted) leading-relaxed">
            You&apos;re signed in as{" "}
            <span className="font-medium text-(--color-fg)">{email}</span>, but
            you haven&apos;t been added to any company yet.
          </p>
          <p className="text-sm text-(--color-fg-muted) leading-relaxed">
            Ask your company admin to invite you, then refresh this page.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.refresh()}
            className="rounded-full bg-(--color-accent) px-6 py-2.5 text-sm font-bold text-(--color-accent-fg) transition-opacity hover:opacity-90"
          >
            Refresh
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 rounded-full border border-(--color-border) px-6 py-2.5 text-sm font-medium text-(--color-fg-muted) transition-colors hover:bg-(--color-surface-1)"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
