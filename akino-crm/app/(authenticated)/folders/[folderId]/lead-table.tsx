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
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FieldDefinition, Lead } from "@/lib/types";
import { updateLead, deleteLeads } from "./actions";

const COL = createColumnHelper<Lead>();

// Status badge tone map
const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "info"> = {
  raw: "neutral",
  enriched: "accent",
  in_pipeline: "success",
  archived: "info",
};

export function LeadTable({
  folderId,
  fields,
  initialLeads,
}: {
  folderId: string;
  fields: FieldDefinition[];
  initialLeads: Lead[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const visibleFields = useMemo(
    () => fields.filter((f) => !f.is_hidden),
    [fields]
  );

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
      // Fixed cols
      COL.accessor("name", {
        header: "Name",
        size: 180,
        cell: (info) => (
          <span className="font-medium">{info.getValue() ?? "—"}</span>
        ),
      }),
      COL.accessor("email", {
        header: "Email",
        size: 220,
        cell: (info) => (
          <span className="text-(--color-fg-muted)">
            {info.getValue() ?? "—"}
          </span>
        ),
      }),
      COL.accessor("company", {
        header: "Company",
        size: 160,
      }),
      COL.accessor("status", {
        header: "Status",
        size: 100,
        cell: (info) => {
          const s = info.getValue();
          return (
            <Badge tone={STATUS_TONE[s] ?? "neutral"}>
              {s.replace("_", " ")}
            </Badge>
          );
        },
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
    [visibleFields]
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
          if (["name", "email", "company"].includes(fieldKey)) {
            return { ...l, [fieldKey]: value };
          }
          return { ...l, data: { ...l.data, [fieldKey]: value } };
        })
      );

      startTransition(async () => {
        if (["name", "email", "company"].includes(fieldKey)) {
          await updateLead(leadId, folderId, { [fieldKey]: value } as Record<string, unknown> as Partial<Lead>);
        } else {
          const lead = leads.find((l) => l.id === leadId);
          if (!lead) return;
          await updateLead(leadId, folderId, {
            data: { ...lead.data, [fieldKey]: value },
          });
        }
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
      <div className="flex-1 overflow-auto" ref={(el) => { parentRef.current = el; }}>
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

      {/* Bottom bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-center gap-4 bg-(--color-surface-2) px-6 py-3 rounded-t-2xl">
          <span className="rounded-full bg-(--color-accent)/15 px-4 py-1 text-sm font-bold text-(--color-accent-text)">
            {selectedIds.length} leads selected
          </span>
          <Button variant="ghost" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}
