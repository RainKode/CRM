"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileView({
  email,
  fullName: initialName,
}: {
  email: string;
  fullName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!fullName.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });
      if (err) {
        setError(err.message);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const initials = (() => {
    const parts = (fullName || email).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0]?.[0]?.toUpperCase() ?? "?";
  })();

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-12 max-w-2xl mx-auto w-full">
        {/* Header */}
        <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
          Settings
        </h2>
        <p className="text-(--color-fg-muted) text-sm mb-10">
          Manage your account and preferences
        </p>

        {/* Profile Card */}
        <div className="rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-card-3d) p-8">
          <div className="flex items-center gap-5 mb-8">
            <div className="h-16 w-16 rounded-full bg-(--color-accent) flex items-center justify-center text-2xl font-bold text-(--color-accent-fg)">
              {initials}
            </div>
            <div>
              <h3 className="text-lg font-bold text-(--color-fg)">
                {fullName || "No name set"}
              </h3>
              <p className="text-sm text-(--color-fg-muted)">{email}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setSaved(false);
                  setError(null);
                }}
                className="h-12 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:ring-1 focus:ring-(--color-accent) focus:outline-none transition-all"
                placeholder="Your full name"
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Email
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="h-12 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) opacity-60 cursor-not-allowed"
              />
            </div>

            {/* Feedback */}
            {error && (
              <p className="text-sm text-(--color-danger)">{error}</p>
            )}
            {saved && (
              <p className="text-sm text-(--color-success)">Profile updated successfully.</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-(--color-card-border)">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-(--color-danger) border border-(--color-danger)/20 hover:bg-(--color-danger)/10 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || fullName === initialName}
                className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-(--color-accent-fg) bg-(--color-accent) hover:bg-(--color-accent-hover) transition-all shadow-(--shadow-btn) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
