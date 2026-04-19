"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Table2, Settings2, Upload, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Folder, FieldDefinition, Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LeadTable } from "./lead-table";
import { FieldSchemaBuilder } from "./field-schema-builder";
import { CsvUpload } from "./csv-upload";
import { createBatchFromFolder } from "@/app/(authenticated)/enrichment/actions";

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
  totalCount,
}: {
  folder: Folder;
  fields: FieldDefinition[];
  initialLeads: Lead[];
  totalCount: number;
}) {
  const [tab, setTab] = useState<Tab>("leads");
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreateBatch() {
    if (!batchName.trim()) return;
    startTransition(async () => {
      await createBatchFromFolder(folder.id, batchName.trim());
      setShowEnrichDialog(false);
      setBatchName("");
      router.push("/enrichment");
    });
  }

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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowEnrichDialog(true)}
          disabled={totalCount === 0}
        >
          <Sparkles className="h-4 w-4" />
          Create Enrichment Batch
        </Button>
        <span className="flex items-center gap-1.5 rounded-full bg-(--color-surface-3) px-4 py-1.5 text-sm font-medium text-(--color-fg-muted)">
          {totalCount} Leads
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
            totalCount={totalCount}
          />
        )}
        {tab === "schema" && (
          <FieldSchemaBuilder folderId={folder.id} fields={fields} />
        )}
        {tab === "upload" && (
          <CsvUpload folderId={folder.id} fields={fields} />
        )}
      </div>

      {/* Enrichment Batch Dialog */}
      {showEnrichDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-(--color-surface-1) rounded-2xl p-8 w-full max-w-md shadow-xl border border-(--color-card-border)">
            <h3 className="text-lg font-bold text-(--color-fg) mb-1">
              Create Enrichment Batch
            </h3>
            <p className="text-sm text-(--color-fg-muted) mb-6">
              All {totalCount} leads in this folder will be added to the batch.
            </p>
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Batch name"
              className="w-full h-11 rounded-xl border border-(--color-card-border) bg-(--color-surface-2) px-4 text-sm text-(--color-fg) mb-4 focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateBatch(); }}
            />
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowEnrichDialog(false);
                  setBatchName("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!batchName.trim() || isPending}
                onClick={handleCreateBatch}
              >
                {isPending ? "Creating…" : "Create Batch"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
