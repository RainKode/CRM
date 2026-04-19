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
import { ArrowUpDown, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FieldDefinition, Lead } from "@/lib/types";
import { updateLead, deleteLeads, getLeads } from "./actions";

const COL = createColumnHelper<Lead>();
const PAGE_SIZE = 50;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
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
  const [, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const visibleFields = useMemo(
    () => fields.filter((f) => !f.is_hidden),
    [fields]
  );

  async function goToPage(p: number) {
    if (p < 1 || p > totalPages || p === page) return;
    setIsPageLoading(true);
    setRowSelection({});
    try {
      const offset = (p - 1) * PAGE_SIZE;
      const newLeads = await getLeads(folderId, { limit: PAGE_SIZE, offset });
      setLeads(newLeads);
      setPage(p);
    } finally {
      setIsPageLoading(false);
    }
  }

  const columns = useMemo(
    () => [
      // Checkbox
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
            onChange={row.getToggleSelectedHandler()}
            className="accent-(--color-accent)"
          />
        ),
        size: 32,
      }),
      // SL (Serial Number)
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
      // Dynamic columns from field schema
      ...visibleFields.map((field) =>
        COL.accessor((row) => (row.data as Record<string, unknown>)[field.key], {
          id: `field_${field.key}`,
          header: field.label,
          size: 150,
          cell: (info) => {
            const val = info.getValue();
            if (val === undefined || val === null) return "—";
            if (field.type === "checkbox")
              return val ? "✓" : "—";
            if (Array.isArray(val)) return val.join(", ");
            return String(val);
          },
        })
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

  // Inline edit handler
  const handleCellEdit = useCallback(
    (leadId: string, fieldKey: string, value: unknown) => {
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const newData = { ...l.data, [fieldKey]: value };
          // Also update top-level columns if the key matches
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
        const updates: Partial<Pick<Lead, "data" | "email" | "name" | "company">> = { data: newData };
        if (fieldKey === "email") updates.email = value as string;
        if (fieldKey === "name") updates.name = value as string;
        if (fieldKey === "company") updates.company = value as string;
        await updateLead(leadId, folderId, updates);
      });
    },
    [folderId, leads]
  );

  // Bulk delete
  const selectedIds = Object.keys(rowSelection).filter(
    (k) => rowSelection[k]
  );

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      await deleteLeads(selectedIds, folderId);
      setLeads((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
      setRowSelection({});
    });
  }

  // Virtual scroll container
  const parentRef = { current: null as HTMLDivElement | null };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-(--color-card-border) overflow-hidden shadow-(--shadow-card)">
      {/* Table */}
      <div className={cn("flex-1 overflow-auto", isPageLoading && "opacity-50 pointer-events-none")} ref={(el) => { parentRef.current = el; }}>
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

      {/* Bottom bar: bulk actions + pagination */}
      <div className="flex items-center justify-between bg-(--color-surface-2) px-6 py-3 border-t border-(--color-card-border)">
        {/* Bulk actions (left) */}
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <>
              <span className="rounded-full bg-(--color-accent)/15 px-4 py-1 text-sm font-bold text-(--color-accent-text)">
                {selectedIds.length} selected
              </span>
              <Button variant="ghost" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>

        {/* Pagination (right) */}
        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-(--color-fg-muted)">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
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
                  <span key={`ellipsis-${i}`} className="px-1 text-(--color-fg-subtle)">…</span>
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
    </div>
  );
}
