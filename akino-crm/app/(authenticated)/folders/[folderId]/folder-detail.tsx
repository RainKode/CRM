"use client";

import { useState } from "react";
import { ArrowLeft, Table2, Settings2, Upload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Folder, FieldDefinition, Lead } from "@/lib/types";
import { LeadTable } from "./lead-table";
import { FieldSchemaBuilder } from "./field-schema-builder";
import { CsvUpload } from "./csv-upload";

type Tab = "leads" | "schema" | "upload";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "leads", label: "Leads", icon: Table2 },
  { key: "schema", label: "Columns", icon: Settings2 },
  { key: "upload", label: "Upload CSV", icon: Upload },
];

export function FolderDetail({
  folder,
  fields,
  initialLeads,
}: {
  folder: Folder;
  fields: FieldDefinition[];
  initialLeads: Lead[];
}) {
  const [tab, setTab] = useState<Tab>("leads");

  return (
    <div className="flex h-full flex-col bg-(--color-bg)">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-5">
        <Link
          href="/folders"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg) transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-(--color-fg)">
            {folder.name}
          </h1>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-(--color-surface-3) px-4 py-1.5 text-sm font-medium text-(--color-fg-muted)">
          {initialLeads.length} Leads
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 md:px-8 pb-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-(--color-accent) text-(--color-accent-fg)"
                  : "bg-(--color-surface-2) text-(--color-fg-muted) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === "leads" && (
          <LeadTable
            folderId={folder.id}
            fields={fields}
            initialLeads={initialLeads}
          />
        )}
        {tab === "schema" && (
          <FieldSchemaBuilder folderId={folder.id} fields={fields} />
        )}
        {tab === "upload" && (
          <CsvUpload folderId={folder.id} fields={fields} />
        )}
      </div>
    </div>
  );
}
