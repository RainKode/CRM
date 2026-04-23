"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, Sun, Moon, Search } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() ?? "?";
}

/**
 * Fires a synthetic ⌘K keyboard event so the CommandPalette (which is
 * already listening globally) toggles open. Keeps Topbar decoupled
 * from the palette's internal state.
 */
function openCommandPalette() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true })
  );
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
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
        onClick={onMenuClick}
        className="flex md:hidden h-10 w-10 items-center justify-center rounded-full text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Command palette trigger — takes the centre/left space */}
      <div className="flex-1 flex items-center pl-2 md:pl-0">
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden md:inline-flex items-center gap-3 h-9 w-full max-w-md rounded-full bg-(--color-surface-3) hover:bg-(--color-surface-4) px-4 text-sm text-(--color-fg-subtle) hover:text-(--color-fg) transition-colors"
          aria-label="Search (⌘K)"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search folders, deals, batches…</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-(--color-bg) text-(--color-fg-subtle) border border-(--color-card-border)">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Mobile search icon */}
        <button
          type="button"
          onClick={openCommandPalette}
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-3) hover:bg-(--color-surface-4) transition-colors text-(--color-fg-muted) hover:text-(--color-fg)"
          aria-label="Search"
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </button>
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
        {/* Notifications bell hidden until a real notifications panel is built.
            Previously rendered as a dead button with no handler. */}
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
