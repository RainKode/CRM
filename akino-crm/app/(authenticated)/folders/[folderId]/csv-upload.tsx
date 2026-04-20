"use client";

import { useState, useCallback, useTransition } from "react";
import Papa from "papaparse";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldDefinition } from "@/lib/types";
import { importLeads } from "./actions";

type Step = "upload" | "map" | "preview" | "result";

export function CsvUpload({
  folderId,
  fields,
}: {
  folderId: string;
  fields: FieldDefinition[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dupMode, setDupMode] = useState<"skip" | "overwrite">("skip");
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-map heuristic
  const autoMap = useCallback(
    (headers: string[]) => {
      const map: Record<string, string> = {};
      const allTargets = fields.map((f) => f.key);
      const claimedTargets = new Set<string>();

      // Pass 1: exact normalized matches
      for (const h of headers) {
        const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const t of allTargets) {
          if (claimedTargets.has(t)) continue;
          const normT = t.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (norm === normT) {
            map[h] = t;
            claimedTargets.add(t);
            break;
          }
        }
      }

      // Pass 2: prefix matches for remaining unmapped headers
      for (const h of headers) {
        if (map[h]) continue;
        const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const t of allTargets) {
          if (claimedTargets.has(t)) continue;
          const normT = t.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normT.length >= 3 && norm.startsWith(normT)) {
            map[h] = t;
            claimedTargets.add(t);
            break;
          }
        }
      }

      return map;
    },
    [fields]
  );

  function handleFile(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        const rows = results.data as Record<string, unknown>[];
        setCsvHeaders(headers);
        setCsvRows(rows);
        setMapping(autoMap(headers));
        setStep("map");
      },
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
  }

  function handleImport() {
    startTransition(async () => {
      const res = await importLeads(folderId, csvRows, mapping, dupMode);
      setResult(res);
      setStep("result");
    });
  }

  // Targets for mapping — only user-defined columns
  const targetOptions = [
    { value: "", label: "— Skip —" },
    ...fields.map((f) => ({ value: f.key, label: f.label })),
  ];

  // Download CSV template based on defined columns
  function handleDownloadTemplate() {
    if (fields.length === 0) return;
    const headers = fields.map((f) => f.label).join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Step: Upload ───
  if (step === "upload") {
    return (
      <div className="flex flex-col items-center gap-4 p-8 md:p-16">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex w-full max-w-lg cursor-pointer flex-col items-center gap-4 rounded-2xl bg-(--color-surface-1) px-8 py-20 text-center transition-all hover:bg-(--color-surface-2) shadow-(--shadow-card-3d) border-2 border-(--color-card-border)"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".csv";
            input.onchange = () => {
              if (input.files?.[0]) handleFile(input.files[0]);
            };
            input.click();
          }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-surface-3)">
            <Upload className="h-7 w-7 text-(--color-fg-muted)" />
          </div>
          <p className="text-base font-bold text-(--color-fg)">
            Drop a CSV file here, or click to browse
          </p>
          <p className="text-sm text-(--color-fg-subtle)">
            Supports up to 50,000 rows · Comma or semicolon separated
          </p>
        </div>

        {fields.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownloadTemplate();
            }}
            className="flex items-center gap-2 rounded-full bg-(--color-surface-2) px-5 py-2.5 text-sm font-medium text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
          >
            <Download className="h-4 w-4" />
            Download CSV Template
          </button>
        )}

        {fields.length === 0 && (
          <p className="text-sm text-(--color-fg-subtle)">
            Define your columns in the <span className="font-medium text-(--color-fg-muted)">Columns</span> tab first, then download a CSV template here.
          </p>
        )}
      </div>
    );
  }

  // ─── Step: Map ───
  if (step === "map") {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-(--color-fg)">Map CSV Columns</h2>
            <p className="text-sm text-(--color-fg-muted)">
              {csvRows.length} rows detected · Map each CSV column to a folder
              field
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dupMode}
              onChange={(e) =>
                setDupMode(e.target.value as "skip" | "overwrite")
              }
              className="h-10 rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
            >
              <option value="skip">Skip duplicates</option>
              <option value="overwrite">Overwrite duplicates</option>
            </select>
            <Button size="sm" onClick={() => setStep("preview")}>
              Preview <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {csvHeaders.map((header) => (
            <div
              key={header}
              className="flex items-center gap-3 rounded-xl bg-(--color-surface-1) px-5 py-3 shadow-sm border-2 border-(--color-card-border)"
            >
              <div className="flex w-48 items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-(--color-fg-subtle)" />
                <span className="truncate text-sm font-medium">{header}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-(--color-fg-subtle)" />
              <select
                value={mapping[header] ?? ""}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, [header]: e.target.value }))
                }
                className={cn(
                  "h-10 flex-1 rounded-xl border-0 px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none",
                  mapping[header] &&
                    Object.entries(mapping).some(
                      ([k, v]) => k !== header && v === mapping[header]
                    )
                    ? "bg-red-500/10 ring-1 ring-red-400/50"
                    : "bg-(--color-surface-2)"
                )}
              >
                {targetOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {mapping[header] &&
                Object.entries(mapping).some(
                  ([k, v]) => k !== header && v === mapping[header]
                ) ? (
                <Badge tone="neutral">Duplicate</Badge>
              ) : mapping[header] ? (
                <Badge tone="accent">Mapped</Badge>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Step: Preview ───
  if (step === "preview") {
    const previewRows = csvRows.slice(0, 10);
    const activeMapping = Object.entries(mapping).filter(([, v]) => v);

    return (
      <div className="p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-(--color-fg)">Import Preview</h2>
            <p className="text-sm text-(--color-fg-muted)">
              First 10 of {csvRows.length} rows as they will appear
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep("map")}
            >
              Back
            </Button>
            <Button size="sm" onClick={handleImport} disabled={isPending}>
              {isPending
                ? "Importing…"
                : `Import ${csvRows.length} rows`}
            </Button>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl bg-(--color-surface-1) shadow-(--shadow-card-3d) border-2 border-(--color-card-border)">
          <table className="w-full text-sm">
            <thead className="bg-(--color-surface-2)">
              <tr>
                {activeMapping.map(([csvH, target]) => (
                  <th
                    key={csvH}
                    className="border-b border-(--color-surface-4) px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle)"
                  >
                    {target}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-(--color-surface-3)"
                >
                  {activeMapping.map(([csvH]) => (
                    <td
                      key={csvH}
                      className="px-4 py-2.5 text-(--color-fg-muted)"
                    >
                      {String(row[csvH] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─── Step: Result ───
  return (
    <div className="flex flex-col items-center gap-5 p-8 md:p-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--color-success)/10">
        <CheckCircle2 className="h-8 w-8 text-(--color-success)" />
      </div>
      <h2 className="text-xl font-bold text-(--color-fg)">Import Complete</h2>
      <div className="flex gap-5 text-sm">
        <span className="text-(--color-success) font-medium">
          {result?.imported ?? 0} imported
        </span>
        <span className="text-(--color-fg-muted)">
          {result?.skipped ?? 0} skipped
        </span>
        {(result?.errors ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 text-red-400 font-medium">
            <AlertCircle className="h-3.5 w-3.5" /> {result?.errors} errors
          </span>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setStep("upload");
          setCsvHeaders([]);
          setCsvRows([]);
          setMapping({});
          setResult(null);
        }}
      >
        Upload another
      </Button>
    </div>
  );
}
