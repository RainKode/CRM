"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";
import {
  getMyCompanies,
  getActiveCompany,
  switchCompany,
  createCompany,
} from "@/app/(authenticated)/companies/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CompanySwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [active, setActive] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getMyCompanies(), getActiveCompany()]).then(
      ([list, current]) => {
        setCompanies(list);
        setActive(current);
      }
    );
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSwitch(companyId: string) {
    if (companyId === active?.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await switchCompany(companyId);
      const [list, current] = await Promise.all([
        getMyCompanies(),
        getActiveCompany(),
      ]);
      setCompanies(list);
      setActive(current);
      setOpen(false);
      router.refresh();
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await createCompany(newName.trim());
      const [list, current] = await Promise.all([
        getMyCompanies(),
        getActiveCompany(),
      ]);
      setCompanies(list);
      setActive(current);
      setNewName("");
      setCreating(false);
      setOpen(false);
      router.refresh();
    });
  }

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (!active) return null;

  return (
    <div ref={ref} className="relative mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
          "hover:bg-(--color-surface-2) active:bg-(--color-surface-3)",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--color-accent)/15 text-(--color-accent) font-bold text-sm">
          {active.logo_url ? (
            <img
              src={active.logo_url}
              alt=""
              className="h-9 w-9 rounded-lg object-cover"
            />
          ) : (
            initials(active.name)
          )}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-(--color-fg) truncate">
                {active.name}
              </p>
              <p className="text-[11px] text-(--color-fg-subtle)">
                {companies.length} workspace{companies.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-(--color-fg-muted) transition-transform",
                open && "rotate-180"
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 rounded-xl border border-(--color-border) bg-(--color-bg) shadow-lg",
            "py-1 min-w-55",
            collapsed ? "left-full top-0 ml-2" : "left-0 right-0"
          )}
        >
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSwitch(c.id)}
              disabled={isPending}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-fg) hover:bg-(--color-surface-2) transition-colors",
                c.id === active.id && "bg-(--color-surface-2)"
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-(--color-accent)/10 text-(--color-accent) text-xs font-bold">
                {initials(c.name)}
              </div>
              <span className="flex-1 text-left truncate">{c.name}</span>
              {c.id === active.id && (
                <Check className="h-4 w-4 text-(--color-accent) shrink-0" />
              )}
            </button>
          ))}

          <div className="border-t border-(--color-border) mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2 flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Company name"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newName.trim() || isPending}
                  className="h-8 px-3"
                >
                  Add
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Create Company</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
