"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Workflow,
  Sparkles,
  Users,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  CheckCircle2,
  Settings2,
  AlertCircle,
  Star,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchStatus, FieldDefinition, FieldType } from "@/lib/types";
import type { FolderBatchGroup } from "@/app/(authenticated)/enrichment/actions";
import type { FolderPipelineGroup } from "@/app/(authenticated)/pipeline/actions";
import { getBatchesGroupedByFolder, getEnrichmentFields } from "@/app/(authenticated)/enrichment/actions";
import { getPipelinesGroupedByFolder } from "@/app/(authenticated)/pipeline/actions";
import { createField, getFieldDefinitions } from "@/app/(authenticated)/folders/[folderId]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { CreatePanel } from "./create-panel";
import { CompanySwitcher } from "./company-switcher";

const STATUS_ICON: Record<BatchStatus, React.ElementType> = {
  not_started: Circle,
  in_progress: Clock,
  complete: CheckCircle2,
};

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
  {
    href: "/enriched",
    label: "Enriched Clients",
    icon: Star,
    matchPrefix: "/enriched",
  },
  { href: "/team", label: "Team", icon: Users, disabled: true },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    matchPrefix: "/settings",
  },
];

// ─── Enrichment Fields Dialog ──────────────────────────────────────
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

function EnrichmentFieldsDialog({
  folderId,
  folderName,
  open,
  onOpenChange,
}: {
  folderId: string;
  folderName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enrichmentFields, setEnrichmentFields] = useState<FieldDefinition[]>([]);
  const [allFields, setAllFields] = useState<FieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    setIsLoading(true);
    const [enr, all] = await Promise.all([
      getEnrichmentFields(folderId),
      getFieldDefinitions(folderId),
    ]);
    setEnrichmentFields(enr);
    setAllFields(all);
    setIsLoading(false);
  }, [folderId]);

  useEffect(() => {
    if (open) loadFields();
  }, [open, loadFields]);

  function validateFieldName(name: string): string | null {
    const lower = name.toLowerCase().trim();
    if (!lower) return "Field label is required.";
    const existing = allFields.find((f) => f.label.toLowerCase() === lower);
    if (existing) return `A field named "${existing.label}" already exists.`;
    const genericTerms = ["email", "phone", "name", "company", "website", "url", "address"];
    for (const term of genericTerms) {
      if (lower === term) {
        const similar = allFields.filter(
          (f) => f.label.toLowerCase().includes(term) || f.key.toLowerCase().includes(term)
        );
        if (similar.length > 0) {
          return `A field containing "${term}" already exists (${similar.map((f) => f.label).join(", ")}). Use a more specific name like "CEO ${name}" or "Decision Maker ${name}".`;
        }
      }
    }
    return null;
  }

  async function handleAddField() {
    const validationError = validateFieldName(label);
    if (validationError) { setError(validationError); return; }
    setError(null);
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    startTransition(async () => {
      await createField(folderId, { key, label: label.trim(), type, is_required: isRequired, is_enrichment: true });
      setLabel(""); setType("text"); setIsRequired(false);
      await loadFields();
      router.refresh();
    });
  }

  async function handleEnsureComments() {
    const hasComments = allFields.some((f) => f.key === "comments" || f.label.toLowerCase() === "comments");
    if (hasComments) return;
    startTransition(async () => {
      await createField(folderId, { key: "comments", label: "Comments", type: "text", is_required: true, is_enrichment: true });
      await loadFields();
      router.refresh();
    });
  }

  const hasComments = allFields.some(
    (f) => (f.key === "comments" || f.label.toLowerCase() === "comments") && f.is_enrichment
  );
  const hasEmail = enrichmentFields.some((f) => f.type === "email" || f.label.toLowerCase().includes("email"));
  const hasPhone = enrichmentFields.some((f) => f.type === "phone" || f.label.toLowerCase().includes("phone"));
  const hasContactMethod = hasEmail || hasPhone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enrichment Fields — {folderName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <p className="text-sm text-(--color-fg-muted) py-8 text-center">Loading fields…</p>
          ) : (
            <div className="space-y-6">
              {!hasComments && (
                <div className="flex items-start gap-3 rounded-xl bg-(--color-warn)/10 border border-(--color-warn)/20 p-4">
                  <AlertCircle className="h-4 w-4 text-(--color-warn) shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-(--color-warn)">Comments field is mandatory</p>
                    <p className="text-xs text-(--color-warn)/70 mt-1">Every enrichment form must include a Comments field.</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={handleEnsureComments} disabled={isPending}>Add Comments</Button>
                </div>
              )}
              {!hasContactMethod && enrichmentFields.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl bg-(--color-danger)/10 border border-(--color-danger)/20 p-4">
                  <AlertCircle className="h-4 w-4 text-(--color-danger) shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-(--color-danger)">Contact method required</p>
                    <p className="text-xs text-(--color-danger)/70 mt-1">Add at least an Email or Phone field so every lead remains actionable.</p>
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-3">
                  Current Enrichment Fields ({enrichmentFields.length})
                </h4>
                {enrichmentFields.length === 0 ? (
                  <p className="text-sm text-(--color-fg-muted) py-4 text-center bg-(--color-surface-2) rounded-xl">No enrichment fields yet. Add fields below.</p>
                ) : (
                  <div className="space-y-1.5">
                    {enrichmentFields.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl bg-(--color-surface-2) px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-(--color-fg)">{f.label}</span>
                          <span className="text-xs text-(--color-fg-subtle) bg-(--color-surface-3) px-2 py-0.5 rounded-full">{f.type}</span>
                        </div>
                        {f.is_required && <span className="text-[10px] font-bold text-(--color-accent) uppercase">Required</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-(--color-card-border) pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-3">Add Enrichment Field</h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <Input placeholder="Field label (e.g., CEO Email)" value={label} onChange={(e) => { setLabel(e.target.value); setError(null); }} className="flex-1" />
                    <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className="h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none">
                      {FIELD_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-(--color-fg-muted) cursor-pointer">
                    <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="accent-(--color-accent)" />
                    Required field
                  </label>
                  {error && (
                    <div className="flex items-start gap-2 text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-xl px-4 py-3">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button size="sm" onClick={handleAddField} disabled={isPending || !label.trim()}>
            <Plus className="h-3.5 w-3.5" />{isPending ? "Adding…" : "Add Field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Nav Link ──────────────────────────────────────────────────────
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
          ? "bg-(--color-accent) text-(--color-accent-fg) font-bold shadow-(--shadow-btn)"
          : "text-(--color-fg-subtle) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", active && "text-(--color-accent-fg)")}
        strokeWidth={active ? 2.25 : 1.75}
      />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const sidebarSearchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [enrichmentGroups, setEnrichmentGroups] = useState<FolderBatchGroup[]>([]);
  const [enrichmentOpen, setEnrichmentOpen] = useState<Set<string>>(new Set());
  const [pipelineGroups, setPipelineGroups] = useState<FolderPipelineGroup[]>([]);
  const [pipelineOpen, setPipelineOpen] = useState<Set<string>>(new Set());
  const [fieldsDialog, setFieldsDialog] = useState<{ folderId: string; folderName: string } | null>(null);

  const isOnEnrichment = pathname === "/enrichment" || pathname.startsWith("/enrichment/");
  const isOnPipeline = pathname === "/pipeline" || pathname.startsWith("/pipeline/");

  // Fetch enrichment data when on enrichment pages
  useEffect(() => {
    if (isOnEnrichment) {
      getBatchesGroupedByFolder().then(setEnrichmentGroups);
    }
  }, [isOnEnrichment, pathname]);

  // Fetch pipeline groups when on pipeline pages
  useEffect(() => {
    if (isOnPipeline) {
      getPipelinesGroupedByFolder().then(setPipelineGroups);
    }
  }, [isOnPipeline, pathname]);

  const isActive = (item: NavItem) =>
    item.matchPrefix
      ? pathname === item.matchPrefix ||
        pathname.startsWith(`${item.matchPrefix}/`)
      : pathname === item.href;

  function toggleEnrichmentFolder(folderId: string) {
    setEnrichmentOpen((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function togglePipelineFolder(folderId: string) {
    setPipelineOpen((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return (
    <>
      <aside
        className={cn(
          "hidden md:flex h-screen shrink-0 flex-col bg-(--color-bg) py-10 transition-all duration-300 rounded-r-2xl",
          collapsed ? "w-20 px-3" : "w-80 px-6"
        )}
        style={{ boxShadow: "var(--shadow-sidebar)" }}
      >
        {/* Brand */}
        <div
          className={cn(
            "mb-10 flex items-center",
            collapsed ? "justify-center" : "px-4 gap-4"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) font-bold text-lg shrink-0">
            R
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-(--color-fg) tracking-tight">
                Rainhub
              </h1>
              <p className="text-xs text-(--color-fg-subtle) font-medium tracking-wide">
                CRM
              </p>
            </div>
          )}
        </div>

        {/* Company Switcher */}
        <CompanySwitcher collapsed={collapsed} />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <div key={item.href}>
              <NavLink
                item={item}
                active={isActive(item)}
                collapsed={collapsed}
              />

              {/* Enrichment sub-navigation */}
              {item.matchPrefix === "/enrichment" &&
                isOnEnrichment &&
                !collapsed &&
                enrichmentGroups.length > 0 && (
                  <div className="ml-5 pl-4 border-l border-(--color-border) mt-1 mb-2 space-y-1">
                    {enrichmentGroups.map((group) => {
                      const isOpen = enrichmentOpen.has(group.folder_id);
                      const folderTotal = group.batches.reduce((s, b) => s + b.total, 0);
                      const folderDone = group.batches.reduce((s, b) => s + b.completed, 0);
                      const folderPct = folderTotal > 0 ? Math.round((folderDone / folderTotal) * 100) : 0;

                      return (
                        <div key={group.folder_id}>
                          {/* Folder row */}
                          <button
                            type="button"
                            onClick={() => toggleEnrichmentFolder(group.folder_id)}
                            className="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-[13px] text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) transition-colors"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            )}
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--color-accent)" />
                            <span className="flex-1 text-left leading-snug wrap-break-word">
                              {group.folder_name}
                            </span>
                            <span className="text-[10px] text-(--color-fg-subtle) shrink-0 mt-0.5">
                              {folderPct}%
                            </span>
                          </button>

                          {/* Expanded batches */}
                          {isOpen && (
                            <div className="ml-4 pl-3 border-l border-(--color-border) space-y-0.5 mt-0.5 mb-1">
                              {group.batches.map((batch) => {
                                const Icon = STATUS_ICON[batch.status];
                                return (
                                  <Link
                                    key={batch.id}
                                    href={`/enrichment/${batch.id}`}
                                    className={cn(
                                      "flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors",
                                      pathname === `/enrichment/${batch.id}`
                                        ? "bg-(--color-accent)/10 text-(--color-accent) font-semibold"
                                        : "text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
                                    )}
                                  >
                                    <Icon className="h-3 w-3 shrink-0 mt-0.5" />
                                    <span className="flex-1 leading-snug wrap-break-word">
                                      {batch.name}
                                    </span>
                                    <span className="text-[10px] text-(--color-fg-subtle) shrink-0">
                                      {batch.completed}/{batch.total}
                                    </span>
                                  </Link>
                                );
                              })}
                              {/* Enrichment Fields button */}
                              <button
                                type="button"
                                onClick={() =>
                                  setFieldsDialog({
                                    folderId: group.folder_id,
                                    folderName: group.folder_name,
                                  })
                                }
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-(--color-accent) hover:bg-(--color-accent)/10 transition-colors w-full"
                              >
                                <Settings2 className="h-3 w-3 shrink-0" />
                                <span>Enrichment Fields</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Pipeline sub-navigation */}
              {item.matchPrefix === "/pipeline" &&
                isOnPipeline &&
                !collapsed &&
                pipelineGroups.length > 0 && (
                  <div className="ml-5 pl-4 border-l border-(--color-border) mt-1 mb-2 space-y-1">
                    {pipelineGroups.map((group) => {
                      const isOpen = pipelineOpen.has(group.folder_id);
                      const totalDeals = group.pipelines.reduce((s, p) => s + p.deal_count, 0);

                      return (
                        <div key={group.folder_id}>
                          {/* Folder row */}
                          <button
                            type="button"
                            onClick={() => togglePipelineFolder(group.folder_id)}
                            className="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-[13px] text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg) transition-colors"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            )}
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--color-accent)" />
                            <span className="flex-1 text-left leading-snug wrap-break-word">
                              {group.folder_name}
                            </span>
                            <span className="text-[10px] text-(--color-fg-subtle) shrink-0 mt-0.5">
                              {totalDeals}
                            </span>
                          </button>

                          {/* Expanded batch pipelines + master view */}
                          {isOpen && (
                            <div className="ml-4 pl-3 border-l border-(--color-border) space-y-0.5 mt-0.5 mb-1">
                              {/* Master folder view link */}
                              <Link
                                href={`/pipeline/folder/${group.folder_id}`}
                                className={cn(
                                  "flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors font-medium",
                                  pathname === `/pipeline/folder/${group.folder_id}`
                                    ? "bg-(--color-accent)/10 text-(--color-accent) font-semibold"
                                    : "text-(--color-accent) hover:bg-(--color-accent)/10"
                                )}
                              >
                                <Workflow className="h-3 w-3 shrink-0 mt-0.5" />
                                <span className="flex-1 leading-snug">All Deals</span>
                                <span className="text-[10px] shrink-0">{totalDeals}</span>
                              </Link>
                              {/* Individual batch pipelines */}
                              {group.pipelines.map((pipeline) => (
                                <Link
                                  key={pipeline.id}
                                  href={`/pipeline?pid=${pipeline.id}`}
                                  className={cn(
                                    "flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors",
                                    pathname === "/pipeline" &&
                                      sidebarSearchParams.get("pid") === pipeline.id
                                      ? "bg-(--color-accent)/10 text-(--color-accent) font-semibold"
                                      : "text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
                                  )}
                                >
                                  <Circle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span className="flex-1 leading-snug wrap-break-word">
                                    {pipeline.name}
                                  </span>
                                  <span className="text-[10px] text-(--color-fg-subtle) shrink-0">
                                    {pipeline.deal_count}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
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

        {/* Create Lead / Customer CTA */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          title={collapsed ? "Create Lead / Customer" : undefined}
          className={cn(
            "flex items-center justify-center rounded-full bg-(--color-accent) text-(--color-accent-fg) font-semibold transition-all duration-200 shadow-(--shadow-btn) hover:shadow-(--shadow-btn-hover) hover:-translate-y-0.5 active:translate-y-0 active:shadow-(--shadow-btn-active) cursor-pointer",
            collapsed ? "p-3" : "gap-2 py-4 px-6"
          )}
        >
          <Plus className="h-5 w-5" />
          {!collapsed && "Create"}
        </button>
      </aside>

      {/* Create Panel (slide-in from right) */}
      <CreatePanel open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Enrichment Fields Dialog (rendered at root to avoid overflow issues) */}
      {fieldsDialog && (
        <EnrichmentFieldsDialog
          folderId={fieldsDialog.folderId}
          folderName={fieldsDialog.folderName}
          open={true}
          onOpenChange={(v) => { if (!v) setFieldsDialog(null); }}
        />
      )}
    </>
  );
}
