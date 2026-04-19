"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Workflow,
  Sparkles,
  Users,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: string;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/folders",
    label: "Data Batches",
    icon: FolderOpen,
    matchPrefix: "/folders",
  },
  {
    href: "/pipeline",
    label: "Sales Pipeline",
    icon: Workflow,
    matchPrefix: "/pipeline",
  },
  {
    href: "/enrichment",
    label: "Enrichment",
    icon: Sparkles,
    matchPrefix: "/enrichment",
  },
  { href: "/team", label: "Team", icon: Users, disabled: true },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  if (item.disabled) {
    return (
      <span
        className="flex items-center gap-4 px-4 py-3 rounded-full text-[15px] text-(--color-fg-subtle) opacity-40 cursor-not-allowed"
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span>{item.label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold">Soon</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-full text-[15px] transition-all",
        active
          ? "bg-(--color-surface-3) text-(--color-fg) font-bold"
          : "text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", active && "text-(--color-accent)")}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.matchPrefix
      ? pathname === item.matchPrefix ||
        pathname.startsWith(`${item.matchPrefix}/`)
      : pathname === item.href;

  return (
    <aside className="hidden md:flex h-screen w-72 shrink-0 flex-col bg-(--color-bg) py-10 px-6" style={{ boxShadow: 'var(--shadow-sidebar)' }}>
      {/* Brand */}
      <div className="mb-12 px-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) font-bold text-lg">
          A
        </div>
        <div>
          <h1 className="text-lg font-bold text-(--color-fg) tracking-tight">
            Akino CRM
          </h1>
          <p className="text-xs text-(--color-fg-subtle) font-medium tracking-wide">
            Outbound Sales
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </nav>

      {/* Create Lead List CTA */}
      <Link
        href="/folders"
        className="mt-auto flex items-center justify-center gap-2 rounded-full bg-(--color-accent) py-4 px-6 text-(--color-accent-fg) font-semibold hover:opacity-90 transition-opacity"
      >
        <Plus className="h-5 w-5" />
        Create Lead List
      </Link>
    </aside>
  );
}
