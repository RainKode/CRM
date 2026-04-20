"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? "?";
}

export function Topbar() {
  const { theme, toggle } = useTheme();
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name as string | undefined;
      setInitials(getInitials(name || data.user?.email));
    });
  }, []);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-(--color-bg)/80 backdrop-blur-[20px] px-6 md:px-8 py-4 border-b-2 border-(--color-card-border)">
      {/* Mobile menu button */}
      <button
        type="button"
        className="flex md:hidden h-10 w-10 items-center justify-center rounded-full text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer - push actions to right */}
      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-3) hover:bg-(--color-surface-4) transition-colors text-(--color-fg-muted) hover:text-(--color-fg)"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Moon className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-3) hover:bg-(--color-surface-4) transition-colors text-(--color-fg)"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <Link
          href="/settings"
          className="h-10 w-10 rounded-full bg-(--color-surface-3) ring-2 ring-(--color-bg) ring-offset-2 ring-offset-(--color-surface-3) flex items-center justify-center text-sm font-medium text-(--color-fg) hover:ring-(--color-accent) transition-all"
          title="Profile & Settings"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
