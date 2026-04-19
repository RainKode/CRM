"use client";

import { Bell, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function Topbar() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-(--color-bg)/80 backdrop-blur-[20px] px-6 md:px-8 py-4 border-b border-(--color-card-border)">
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
        <div className="h-10 w-10 rounded-full bg-(--color-surface-3) ring-2 ring-(--color-bg) ring-offset-2 ring-offset-(--color-surface-3) flex items-center justify-center text-sm font-medium text-(--color-fg)">
          R
        </div>
      </div>
    </header>
  );
}
