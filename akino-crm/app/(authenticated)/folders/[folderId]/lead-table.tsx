"use client";

import { useMemo, useState, useCallback, useTransition } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Columns3,
  Pencil,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { FieldDefinition, Lead } from "@/lib/types";
import { updateLead, deleteLeads, deleteAllLeadsInFolder, getLeads, getAllLeadIds } from "./actions";
import { BulkEditPopover } from "./bulk-edit-popover";
import { downloadCsv, csvCell, timestampedFilename } from "@/lib/csv-export";

const COL = createColumnHelper<Lead>();
const PAGE_SIZE = 50;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3)
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function LeadTable({
  folderId,
  fields,
  initialLeads,
  totalCount,
}: {
  folderId: string;
  fields: FieldDefinition[];
  initialLeads: Lead[];
  totalCount: number;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [page, setPage] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditIds, setBulkEditIds] = useState<string[]>([]);
  const [allLeadIds, setAllLeadIds] = useState<string[] | null>(null);
  const [hiddenFieldIds, setHiddenFieldIds] = useState<Set<string>>(
    () => new Set(fields.filter((f) => f.is_hidden).map((f) => f.id))
  );
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const visibleFields = useMemo(
    () => fields.filter((f) => !hiddenFieldIds.has(f.id) && !f.is_enrichment),
    [fields, hiddenFieldIds]
  );

  function toggleFieldVisibility(fieldId: string) {
    setHiddenFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }

  async function goToPage(p: number) {
    if (p < 1 || p > totalPages || p === page) return;
    setIsPageLoading(true);
    setRowSelection({});
    setSelectAllMode(false);
    try {
      const offset = (p - 1) * PAGE_SIZE;
      const newLeads = await getLeads(folderId, { limit: PAGE_SIZE, offset });
      setLeads(newLeads);
      setPage(p);
    } finally {
      setIsPageLoading(false);
    }
  }

  async function handleSelectAll() {
    if (!allLeadIds) {
      const ids = await getAllLeadIds(folderId);
      setAllLeadIds(ids);
      const sel: Record<string, boolean> = {};
      for (const id of ids) sel[id] = true;
      setRowSelection(sel);
    } else {
      const sel: Record<string, boolean> = {};
      for (const id of allLeadIds) sel[id] = true;
      setRowSelection(sel);
    }
    setSelectAllMode(true);
  }

  function handleClearSelection() {
    setRowSelection({});
    setSelectAllMode(false);
  }

  const columns = useMemo(
    () => [
      COL.display({
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="accent-(--color-accent)"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={(e) => {
              row.getToggleSelectedHandler()(e);
              if (!e.target.checked) setSelectAllMode(false);
            }}
            className="accent-(--color-accent)"
          />
        ),
        size: 32,
      }),
      COL.display({
        id: "sl",
        header: "SL.",
        cell: ({ row }) => (
          <span className="text-(--color-fg-subtle) font-medium">
            {(page - 1) * PAGE_SIZE + row.index + 1}
          </span>
        ),
        size: 50,
      }),
      COL.display({
        id: "rating",
        header: "Rating",
        cell: ({ row }) => {
          const r = row.original.quality_rating;
          if (r == null) return <span className="text-(--color-fg-subtle)">�</span>;
          return (
            <span className="font-bold text-(--color-fg)">
              {r}<span className="text-xs font-normal text-(--color-fg-muted)">/10</span>
            </span>
          );
        },
        size: 70,
      }),
      ...visibleFields.map((field) =>
        COL.accessor(
          (row) => (row.data as Record<string, unknown>)[field.key],
          {
            id: `field_${field.key}`,
            header: field.label,
            size: 150,
            cell: (info) => {
              const val = info.getValue();
              const lead = info.row.original;
              // Make name column clickable
              if (field.key === "name") {
                return (
                  <Link
                    href={`/folders/${folderId}/leads/${lead.id}`}
                    className="text-(--color-accent) hover:underline font-medium"
                  >
                    {val != null && val !== "" ? String(val) : lead.name || "�"}
                  </Link>
                );
              }
              if (val === undefined || val === null) return "\u2014";
              if (field.type === "checkbox") return val ? "\u2713" : "\u2014";
              if (Array.isArray(val)) return val.join(", ");
              return String(val);
            },
          }
        )
      ),
    ],
    [visibleFields, page]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  const { rows } = table.getRowModel();

  const handleCellEdit = useCallback(
    (leadId: string, fieldKey: string, value: unknown) => {
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const newData = { ...l.data, [fieldKey]: value };
          const updates: Partial<Lead> = { data: newData };
          if (fieldKey === "email") updates.email = value as string;
          if (fieldKey === "name") updates.name = value as string;
          if (fieldKey === "company") updates.company = value as string;
          return { ...l, ...updates };
        })
      );

      startTransition(async () => {
        const lead = leads.find((l) => l.id === leadId);
        if (!lead) return;
        const newData = { ...lead.data, [fieldKey]: value };
        const updates: Partial<
          Pick<Lead, "data" | "email" | "name" | "company">
        > = { data: newData };
        if (fieldKey === "email") updates.email = value as string;
        if (fieldKey === "name") updates.name = value as string;
        if (fieldKey === "company") updates.company = value as string;
        await updateLead(leadId, folderId, updates);
      });
    },
    [folderId, leads]
  );

  const selectedIds = Object.keys(rowSelection).filter(
    (k) => rowSelection[k]
  );
  const selectedCount = selectAllMode ? totalCount : selectedIds.length;
  const allOnPageSelected =
    leads.length > 0 && leads.every((l) => rowSelection[l.id]);

  function handleBulkDelete() {
    if (selectedIds.length === 0 && !selectAllMode) return;
    startTransition(async () => {
      if (selectAllMode) {
        await deleteAllLeadsInFolder(folderId);
        setLeads([]);
      } else {
        await deleteLeads(selectedIds, folderId);
        setLeads((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
      }
      setRowSelection({});
      setSelectAllMode(false);
      setAllLeadIds(null);
    });
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-(--color-card-border) overflow-hidden shadow-(--shadow-card-3d) relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-(--color-surface-1) border-b border-(--color-card-border)">
        <div className="text-xs text-(--color-fg-muted)">
          {visibleFields.length} of {fields.length} columns shown
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              // Export selected if there's a selection, otherwise the full folder.
              const ids = selectAllMode
                ? allLeadIds ?? (await getAllLeadIds(folderId))
                : selectedIds.length > 0
                  ? selectedIds
                  : null;

              // Fetch all leads in pages (one pass), then optionally filter by id.
              const all: Lead[] = [];
              const PAGE = 500;
              let off = 0;
              while (true) {
                const batch = await getLeads(folderId, { limit: PAGE, offset: off });
                all.push(...batch);
                if (batch.length < PAGE) break;
                off += PAGE;
              }
              const idSet = ids ? new Set(ids) : null;
              const rows = idSet ? all.filter((l) => idSet.has(l.id)) : all;

              if (rows.length === 0) return;

              const visibleCustom = fields.filter(
                (f) => !hiddenFieldIds.has(f.id) && !f.is_enrichment
              );
              const exportRows = rows.map((l) => {
                const row: Record<string, string> = {
                  Name: csvCell(l.name),
                  Email: csvCell(l.email),
                  Company: csvCell(l.company),
                  Status: csvCell(l.status),
                  Notes: csvCell(l.notes),
                  Tags: csvCell((l.tags ?? []).join(", ")),
                  "Created At": csvCell(l.created_at),
                };
                for (const f of visibleCustom) {
                  if (["name", "email", "company", "notes", "status"].includes(f.key)) continue;
                  row[f.label] = csvCell(l.data?.[f.key]);
                }
                return row;
              });
              downloadCsv(timestampedFilename("leads"), exportRows);
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
            title="Export to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFieldPanel(!showFieldPanel)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                showFieldPanel
                  ? "bg-(--color-accent) text-(--color-accent-fg)"
                  : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3)"
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Fields
            </button>

          {showFieldPanel && (
            <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl bg-(--color-surface-1) border-2 border-(--color-card-border) shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-card-border)">
                <span className="text-sm font-bold text-(--color-fg)">
                  Toggle Columns
                </span>
                <button
                  type="button"
                  onClick={() => setShowFieldPanel(false)}
                  className="text-(--color-fg-subtle) hover:text-(--color-fg)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {fields.filter((f) => !f.is_enrichment).map((field) => {
                  const isVisible = !hiddenFieldIds.has(field.id);
                  return (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => toggleFieldVisibility(field.id)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-(--color-surface-2) transition-colors"
                    >
                      {isVisible ? (
                        <Eye className="h-4 w-4 text-(--color-accent) shrink-0" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-(--color-fg-subtle) shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate",
                          isVisible
                            ? "text-(--color-fg)"
                            : "text-(--color-fg-subtle)"
                        )}
                      >
                        {field.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 px-4 py-3 border-t border-(--color-card-border)">
                <button
                  type="button"
                  onClick={() => setHiddenFieldIds(new Set())}
                  className="flex-1 rounded-lg bg-(--color-surface-2) py-1.5 text-xs font-medium text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHiddenFieldIds(new Set(fields.map((f) => f.id)))
                  }
                  className="flex-1 rounded-lg bg-(--color-surface-2) py-1.5 text-xs font-medium text-(--color-fg-muted) hover:bg-(--color-surface-3) transition-colors"
                >
                  Hide All
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Select all banner */}
      {allOnPageSelected && !selectAllMode && totalCount > leads.length && (
        <div className="flex items-center justify-center gap-2 bg-(--color-accent)/10 px-4 py-2 text-sm">
          <span className="text-(--color-fg-muted)">
            All {leads.length} leads on this page are selected.
          </span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="font-bold text-(--color-accent) hover:underline"
          >
            Select all {totalCount} leads
          </button>
        </div>
      )}
      {selectAllMode && (
        <div className="flex items-center justify-center gap-2 bg-(--color-accent)/10 px-4 py-2 text-sm">
          <span className="font-bold text-(--color-accent)">
            All {totalCount} leads are selected.
          </span>
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-(--color-fg-muted) hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className={cn(
          "flex-1 overflow-auto",
          isPageLoading && "opacity-50 pointer-events-none"
        )}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-(--color-surface-2)">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="border-b border-(--color-surface-4) px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1.5 hover:text-(--color-fg) transition-colors"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-20 text-center text-sm text-(--color-fg-subtle)"
                >
                  No leads yet. Upload a CSV or add leads manually.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-(--color-surface-3) transition-colors",
                    row.getIsSelected()
                      ? "bg-(--color-accent)/5"
                      : "hover:bg-(--color-surface-1)"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-4 py-2.5"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between bg-(--color-surface-2) px-6 py-3 border-t border-(--color-card-border)">
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <>
              <span className="rounded-full bg-(--color-accent)/15 px-4 py-1 text-sm font-bold text-(--color-accent-text)">
                {selectedCount} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const ids = selectAllMode
                    ? allLeadIds ?? (await getAllLeadIds(folderId))
                    : selectedIds;
                  if (selectAllMode && !allLeadIds) setAllLeadIds(ids);
                  setBulkEditIds(ids);
                  setBulkEditOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit field
              </Button>
              <Button variant="ghost" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-(--color-fg-muted)">
              {(page - 1) * PAGE_SIZE + 1}&ndash;
              {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => goToPage(1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-fg-muted) hover:bg-(--color-surface-3) disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page === 1}
                onClick={() => goToPage(page - 1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-fg-muted) hover:bg-(--color-surface-3) disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-1 text-(--color-fg-subtle)"
                  >
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    className={cn(
                      "h-8 min-w-8 px-2 flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
                      p === page
                        ? "bg-(--color-accent) text-(--color-accent-fg)"
                        : "text-(--color-fg-muted) hover:bg-(--color-surface-3)"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => goToPage(page + 1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-fg-muted) hover:bg-(--color-surface-3) disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => goToPage(totalPages)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-fg-muted) hover:bg-(--color-surface-3) disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <BulkEditPopover
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        folderId={folderId}
        selectedIds={bulkEditIds}
        selectedCount={selectedCount}
        fields={fields}
        onDone={() => {
          // Re-fetch current page to reflect the bulk update
          startTransition(async () => {
            const fresh = await getLeads(folderId, {
              limit: PAGE_SIZE,
              offset: (page - 1) * PAGE_SIZE,
            });
            setLeads(fresh);
            setRowSelection({});
            setSelectAllMode(false);
          });
        }}
      />
    </div>
  );
}
