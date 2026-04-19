"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Workflow,
  Sparkles,
  Users,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
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

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  if (item.disabled) {
    return (
      <span
        className={cn(
          "flex items-center rounded-full text-[15px] text-(--color-fg-subtle) opacity-40 cursor-not-allowed",
          collapsed ? "justify-center p-3" : "gap-4 px-4 py-3"
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && (
          <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold">
            Soon
          </span>
        )}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-full text-[15px] transition-all",
        collapsed ? "justify-center p-3" : "gap-4 px-4 py-3",
        active
          ? "bg-(--color-surface-3) text-(--color-fg) font-bold"
          : "text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", active && "text-(--color-accent)")}
        strokeWidth={active ? 2.25 : 1.75}
      />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (item: NavItem) =>
    item.matchPrefix
      ? pathname === item.matchPrefix ||
        pathname.startsWith(`${item.matchPrefix}/`)
      : pathname === item.href;

  return (
    <aside
      className={cn(
        "hidden md:flex h-screen shrink-0 flex-col bg-(--color-bg) py-10 transition-all duration-300",
        collapsed ? "w-20 px-3" : "w-72 px-6"
      )}
      style={{ boxShadow: "var(--shadow-sidebar)" }}
    >
      {/* Brand */}
      <div
        className={cn(
          "mb-12 flex items-center",
          collapsed ? "justify-center" : "px-4 gap-4"
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) font-bold text-lg shrink-0">
          A
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold text-(--color-fg) tracking-tight">
              Akino CRM
            </h1>
            <p className="text-xs text-(--color-fg-subtle) font-medium tracking-wide">
              Outbound Sales
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "mb-4 flex items-center justify-center rounded-full py-3 text-sm font-medium text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) transition-colors",
          collapsed ? "px-3" : "gap-2 px-4"
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <>
            <PanelLeftClose className="h-5 w-5" />
            <span>Collapse</span>
          </>
        )}
      </button>

      {/* Create Lead List CTA */}
      <Link
        href="/folders"
        title={collapsed ? "Create Lead List" : undefined}
        className={cn(
          "flex items-center justify-center rounded-full bg-(--color-accent) text-(--color-accent-fg) font-semibold hover:opacity-90 transition-opacity",
          collapsed ? "p-3" : "gap-2 py-4 px-6"
        )}
      >
        <Plus className="h-5 w-5" />
        {!collapsed && "Create Lead List"}
      </Link>
    </aside>
  );
}
