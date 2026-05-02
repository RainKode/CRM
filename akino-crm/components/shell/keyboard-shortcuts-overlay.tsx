"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

type ShortcutGroup = {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
};

const GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["Ctrl", "K"], label: "Open command palette (Win/Linux)" },
      { keys: ["/"], label: "Focus search" },
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close dialogs / palettes" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "D"], label: "Go to Dashboard" },
      { keys: ["G", "F"], label: "Go to Folders" },
      { keys: ["G", "P"], label: "Go to Pipeline" },
      { keys: ["G", "E"], label: "Go to Enrichment" },
      { keys: ["G", "Q"], label: "Go to Follow-up Queue" },
      { keys: ["G", "T"], label: "Go to Tasks" },
      { keys: ["G", "S"], label: "Go to Settings" },
    ],
  },
  {
    title: "Lists & tables",
    shortcuts: [
      { keys: ["↑", "↓"], label: "Navigate rows / results" },
      { keys: ["J", "K"], label: "Next / previous row (vim-style)" },
      { keys: ["Enter"], label: "Open highlighted item" },
    ],
  },
  {
    title: "Follow-up queue",
    shortcuts: [
      { keys: ["X"], label: "Complete highlighted item" },
      { keys: ["S"], label: "Snooze highlighted item (tomorrow)" },
    ],
  },
];

/**
 * Global keyboard shortcuts help overlay. Press `?` (when not typing) to
 * toggle. Also listens for G+<key> sequences for quick navigation.
 */
export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Two-key G-then-X "go to" sequences, like gmail/linear.
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;

      // `?` toggles this help. Requires shift on most keyboards; key is "?".
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }

      // Navigation sequences: G then [D|F|P|E|S].
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!gPending && k === "g") {
        gPending = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => (gPending = false), 1200);
        return;
      }
      if (gPending) {
        gPending = false;
        if (gTimer) clearTimeout(gTimer);
        const map: Record<string, string> = {
          d: "/",
          f: "/folders",
          p: "/pipeline",
          e: "/enrichment",
          q: "/queue",
          t: "/tasks",
          s: "/settings",
        };
        const target = map[k];
        if (target) {
          e.preventDefault();
          window.location.assign(target);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl bg-(--color-surface-1) border border-(--color-border) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border)">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-(--color-blue)/12 flex items-center justify-center">
              <Keyboard className="h-5 w-5 text-(--color-blue)" />
            </div>
            <div>
              <div className="text-sm font-bold text-(--color-fg)">
                Keyboard shortcuts
              </div>
              <div className="text-xs text-(--color-fg-muted)">
                Press{" "}
                <kbd className="font-mono bg-(--color-surface-3) px-1 rounded">
                  ?
                </kbd>{" "}
                any time to reopen.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 w-8 rounded-lg text-(--color-fg-subtle) hover:text-(--color-fg) hover:bg-(--color-surface-3) transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-2">
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.shortcuts.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="text-sm text-(--color-fg-muted)">
                      {s.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-(--color-surface-2) border border-(--color-border) text-(--color-fg)"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
