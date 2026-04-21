"use client";

import Papa from "papaparse";

/**
 * Trigger a browser download of the given CSV rows. Uses papaparse's
 * unparse to ensure proper escaping (quotes, commas, newlines).
 */
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[]
) {
  if (rows.length === 0 && !columns) {
    // Nothing to export — silently no-op. Callers should guard.
    return;
  }

  const csv = Papa.unparse(rows, {
    columns,
    quotes: true,
    skipEmptyLines: false,
  });

  // Prepend a BOM so Excel opens UTF-8 content correctly.
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Free the blob handle after the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Format a value as a safe CSV cell. Objects/arrays are JSON-stringified.
 * Null/undefined become empty strings.
 */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Build a default filename from a base name + current timestamp.
 */
export function timestampedFilename(base: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}-${stamp}.csv`;
}
