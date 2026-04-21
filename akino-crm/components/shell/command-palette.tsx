"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderOpen,
  Sparkles,
  Workflow,
  User,
  LayoutDashboard,
  Star,
  Settings,
  CheckSquare,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchEverything, type SearchResult } from "@/app/(authenticated)/search-actions";

// ─── Static navigation commands (always available, no query needed) ──
type NavCommand = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
  keywords: string[];
};

const NAV_COMMANDS: NavCommand[] = [
  {
    id: "nav-dashboard",
    title: "Go to Dashboard",
    subtitle: "Home",
    href: "/",
    icon: LayoutDashboard,
    keywords: ["dashboard", "home", "overview"],
  },
  {
    id: "nav-folders",
    title: "Go to Data Batches",
    subtitle: "Lead folders",
    href: "/folders",
    icon: FolderOpen,
    keywords: ["folders", "data", "batches", "leads"],
  },
  {
    id: "nav-pipeline",
    title: "Go to Sales Pipeline",
    subtitle: "Kanban & deals",
    href: "/pipeline",
    icon: Workflow,
    keywords: ["pipeline", "sales", "deals", "kanban"],
  },
  {
    id: "nav-enrichment",
    title: "Go to Enrichment",
    subtitle: "Batches & enrichment queue",
    href: "/enrichment",
    icon: Sparkles,
    keywords: ["enrichment", "enrich", "research"],
  },
  {
    id: "nav-enriched",
    title: "Go to Enriched Clients",
    subtitle: "All enriched leads",
    href: "/enriched",
    icon: Star,
    keywords: ["enriched", "clients"],
  },
  {
    id: "nav-tasks",
    title: "Go to Tasks",
    subtitle: "Standalone to-dos",
    href: "/tasks",
    icon: CheckSquare,
    keywords: ["tasks", "todo", "to do", "to-do", "due"],
  },
  {
    id: "nav-settings",
    title: "Go to Settings",
    subtitle: "Account & preferences",
    href: "/settings",
    icon: Settings,
    keywords: ["settings", "preferences", "account", "profile"],
  },
];

function matchesNav(cmd: NavCommand, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    cmd.title.toLowerCase().includes(needle) ||
    cmd.keywords.some((k) => k.includes(needle))
  );
}

const KIND_META: Record<SearchResult["kind"], { Icon: React.ElementType; label: string }> = {
  folder: { Icon: FolderOpen, label: "Folder" },
  deal: { Icon: Workflow, label: "Deal" },
  batch: { Icon: Sparkles, label: "Batch" },
  lead: { Icon: User, label: "Lead" },
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ─── Global hotkey: ⌘K / Ctrl+K to toggle ───────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMetaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isMetaK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" opens palette when not in an input
      if (
        e.key === "/" &&
        !open &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement | null)?.isContentEditable
      ) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setHighlight(0);
      return;
    }
    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  // ─── Debounced server search ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const res = await searchEverything(query);
        setResults(res);
        setHighlight(0);
      });
    }, query ? 150 : 0);
    return () => clearTimeout(handle);
  }, [query, open]);

  // ─── Combined list (nav first when no query or they match) ──────
  const combined = useMemo(() => {
    const matchingNav = NAV_COMMANDS.filter((c) => matchesNav(c, query));
    const navItems = matchingNav.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      href: c.href,
      icon: c.icon,
      kindLabel: "Navigate",
      isNav: true,
    }));
    const resultItems = results.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      href: r.href,
      icon: KIND_META[r.kind].Icon,
      kindLabel: KIND_META[r.kind].label,
      isNav: false,
    }));
    return [...navItems, ...resultItems];
  }, [query, results]);

  // Keep highlight in range
  useEffect(() => {
    if (highlight >= combined.length) setHighlight(Math.max(0, combined.length - 1));
  }, [combined.length, highlight]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  function runItem(idx: number) {
    const item = combined[idx];
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(combined.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl rounded-2xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-(--shadow-popover) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-(--color-card-border)/40">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-(--color-fg-subtle) shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search folders, deals, batches, leads…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle)"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-(--color-surface-3) text-(--color-fg-subtle) border border-(--color-card-border)">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {combined.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-(--color-fg-muted)">
              {isPending ? "Searching…" : "No matches."}
            </div>
          ) : (
            combined.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === highlight;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-idx={idx}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => runItem(idx)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    active
                      ? "bg-(--color-accent)/10 text-(--color-fg)"
                      : "text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      active
                        ? "bg-(--color-accent)/20 text-(--color-accent)"
                        : "bg-(--color-surface-3) text-(--color-fg-subtle)"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-(--color-fg) truncate">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-(--color-fg-subtle) truncate">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-(--color-fg-subtle) shrink-0">
                    {item.kindLabel}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hotkey legend */}
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-(--color-card-border)/40 bg-(--color-surface-2) text-[11px] text-(--color-fg-subtle)">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="h-3 w-3" /><ArrowDown className="h-3 w-3" />
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> Open
            </span>
          </div>
          <span className="font-mono">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
