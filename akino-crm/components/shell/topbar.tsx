"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, Sun, Moon, Search } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-50 flex min-h-[74px] items-center justify-between gap-5 bg-(--color-surface-2)/82 px-6 py-4 backdrop-blur-[18px] border-b border-(--color-border) md:px-8">
      {/* Mobile menu button */}
      <Button
        type="button"
        onClick={onMenuClick}
        variant="secondary"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Command palette trigger — takes the centre/left space */}
      <div className="flex-1 flex items-center pl-2 md:pl-0">
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-11 w-[min(520px,100%)] items-center gap-3 rounded-full border border-(--color-border) bg-white px-4 text-sm text-(--color-fg-muted) transition-colors hover:text-(--color-fg) md:inline-flex"
          aria-label="Search (⌘K)"
        >
          <Search className="size-5" />
          <span className="flex-1 truncate text-left">Search folders, deals, batches...</span>
          <kbd className="min-w-[46px] rounded-full bg-(--color-surface-2) px-2 py-0.5 text-center text-[11px] font-bold text-(--color-fg-muted)">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Mobile search icon */}
        <Button
          type="button"
          onClick={openCommandPalette}
          variant="secondary"
          size="icon"
          className="md:hidden"
          aria-label="Search"
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </Button>
        {/* Theme toggle */}
        <Button
          type="button"
          onClick={toggle}
          variant="secondary"
          size="icon"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Moon className="h-5 w-5" strokeWidth={1.75} />
          )}
        </Button>
        {/* Notifications bell hidden until a real notifications panel is built.
            Previously rendered as a dead button with no handler. */}
        <Link
          href="/settings"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-(--color-border) text-sm font-bold text-(--color-fg) transition-colors hover:bg-(--color-surface-2)"
          title="Profile & Settings"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
