"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  Plus,
  Star,
  Trash2,
  GripVertical,
  Check,
  Pencil,
  X,
  ChevronRight,
  User,
  Mail,
  FileText,
} from "lucide-react";
import type { PipelineTemplateWithStages, PipelineTemplateStage } from "@/lib/types";
import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  addTemplateStage,
  updateTemplateStage,
  archiveTemplateStage,
  reorderTemplateStages,
} from "@/app/(authenticated)/pipeline/templates/actions";

export function PipelineTemplatesView({
  initialTemplates,
}: {
  initialTemplates: PipelineTemplateWithStages[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates.find((t) => t.is_default)?.id ?? initialTemplates[0]?.id ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // New template name input
  const [newTemplateName, setNewTemplateName] = useState("");
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  // Inline stage rename
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");

  // New stage name input
  const [newStageName, setNewStageName] = useState("");
  const [showNewStage, setShowNewStage] = useState(false);

  // Rename template
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  function refresh() {
    router.refresh();
    startTransition(async () => {
      // Reload from server after mutation
      const { listTemplates } = await import(
        "@/app/(authenticated)/pipeline/templates/actions"
      );
      const fresh = await listTemplates();
      setTemplates(fresh);
    });
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleCreateTemplate() {
    if (!newTemplateName.trim()) return;
    run(async () => {
      const t = await createTemplate(newTemplateName.trim());
      setSelectedId(t.id);
      setNewTemplateName("");
      setShowNewTemplate(false);
    });
  }

  function handleSetDefault(templateId: string) {
    run(() => updateTemplate(templateId, { is_default: true }));
  }

  function handleArchiveTemplate(templateId: string) {
    run(() => archiveTemplate(templateId));
  }

  function handleRenameTemplate(templateId: string) {
    if (!editingTemplateName.trim()) return;
    run(async () => {
      await updateTemplate(templateId, { name: editingTemplateName.trim() });
      setEditingTemplateId(null);
    });
  }

  function handleAddStage() {
    if (!selected || !newStageName.trim()) return;
    run(async () => {
      await addTemplateStage(selected.id, newStageName.trim());
      setNewStageName("");
      setShowNewStage(false);
    });
  }

  function handleRenameStage(stageId: string) {
    if (!editingStageName.trim()) return;
    run(async () => {
      await updateTemplateStage(stageId, { name: editingStageName.trim() });
      setEditingStageId(null);
    });
  }

  function handleArchiveStage(stageId: string) {
    run(() => archiveTemplateStage(stageId));
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-12 max-w-4xl mx-auto w-full">
        {/* Header */}
        <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
          Settings
        </h2>
        <p className="text-(--color-fg-muted) text-sm mb-10">
          Manage your account and preferences
        </p>

        {/* Sub-sections nav */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-8">
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) p-4 hover:border-(--color-accent) transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-(--color-fg)">Profile</p>
              <p className="text-xs text-(--color-fg-subtle)">Your name & sign-out</p>
            </div>
            <ChevronRight className="h-4 w-4 text-(--color-fg-subtle)" />
          </Link>
          <Link
            href="/settings/email"
            className="flex items-center gap-3 rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) p-4 hover:border-(--color-accent) transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-(--color-fg)">Email accounts</p>
              <p className="text-xs text-(--color-fg-subtle)">Connect Gmail / Outlook</p>
            </div>
            <ChevronRight className="h-4 w-4 text-(--color-fg-subtle)" />
          </Link>
          <Link
            href="/settings/templates"
            className="flex items-center gap-3 rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) p-4 hover:border-(--color-accent) transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-(--color-fg)">Email templates</p>
              <p className="text-xs text-(--color-fg-subtle)">Reusable snippets</p>
            </div>
            <ChevronRight className="h-4 w-4 text-(--color-fg-subtle)" />
          </Link>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-(--color-accent)/50 bg-(--color-accent)/5 p-4">
            <div className="h-10 w-10 rounded-full bg-(--color-accent) text-(--color-accent-fg) flex items-center justify-center">
              <GitBranch className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-(--color-fg)">Pipeline templates</p>
              <p className="text-xs text-(--color-fg-subtle)">Stage blueprints</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-(--color-danger)/10 border border-(--color-danger)/30 px-4 py-3 text-sm text-(--color-danger)">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ── Template list ──────────────────────────────────────── */}
          <div className="md:col-span-1">
            <div className="rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-card-border)">
                <span className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                  Templates
                </span>
                <button
                  onClick={() => setShowNewTemplate(true)}
                  className="h-7 w-7 rounded-lg bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center hover:bg-(--color-accent) hover:text-(--color-accent-fg) transition-colors"
                  title="New template"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {showNewTemplate && (
                <div className="px-3 py-2 border-b border-(--color-card-border) bg-(--color-surface-2)">
                  <input
                    autoFocus
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateTemplate();
                      if (e.key === "Escape") {
                        setShowNewTemplate(false);
                        setNewTemplateName("");
                      }
                    }}
                    placeholder="Template name…"
                    className="w-full h-8 rounded-lg bg-(--color-surface-1) px-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleCreateTemplate}
                      disabled={isPending || !newTemplateName.trim()}
                      className="flex-1 h-7 rounded-lg bg-(--color-accent) text-(--color-accent-fg) text-xs font-semibold disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowNewTemplate(false);
                        setNewTemplateName("");
                      }}
                      className="h-7 w-7 rounded-lg bg-(--color-surface-2) text-(--color-fg-muted) flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              <ul className="divide-y divide-(--color-card-border)">
                {templates.map((t) => (
                  <li key={t.id}>
                    {editingTemplateId === t.id ? (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input
                          autoFocus
                          value={editingTemplateName}
                          onChange={(e) => setEditingTemplateName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameTemplate(t.id);
                            if (e.key === "Escape") setEditingTemplateId(null);
                          }}
                          className="flex-1 h-7 rounded-lg bg-(--color-surface-2) px-2 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                        />
                        <button
                          onClick={() => handleRenameTemplate(t.id)}
                          className="text-(--color-success)"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingTemplateId(null)}
                          className="text-(--color-fg-muted)"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-(--color-surface-2) transition-colors ${
                          selectedId === t.id
                            ? "bg-(--color-accent)/8 border-l-2 border-(--color-accent)"
                            : ""
                        }`}
                      >
                        {t.is_default && (
                          <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="flex-1 truncate text-sm font-medium text-(--color-fg)">
                          {t.name}
                        </span>
                        <span className="text-xs text-(--color-fg-subtle)">
                          {t.stages.length}
                        </span>
                        {selectedId === t.id && (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingTemplateId(t.id);
                                setEditingTemplateName(t.name);
                              }}
                              className="h-5 w-5 rounded flex items-center justify-center hover:bg-(--color-surface-1) text-(--color-fg-muted)"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            {!t.is_default && (
                              <>
                                <button
                                  onClick={() => handleSetDefault(t.id)}
                                  className="h-5 w-5 rounded flex items-center justify-center hover:bg-(--color-surface-1) text-amber-500"
                                  title="Set as default"
                                >
                                  <Star className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleArchiveTemplate(t.id)}
                                  className="h-5 w-5 rounded flex items-center justify-center hover:bg-(--color-surface-1) text-(--color-danger)"
                                  title="Archive template"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Stage editor ───────────────────────────────────────── */}
          <div className="md:col-span-2">
            {selected ? (
              <div className="rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-card-border)">
                  <div>
                    <span className="text-sm font-bold text-(--color-fg)">{selected.name}</span>
                    {selected.is_default && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowNewStage(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-(--color-accent)/10 text-(--color-accent) text-xs font-semibold hover:bg-(--color-accent) hover:text-(--color-accent-fg) transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add stage
                  </button>
                </div>

                <p className="px-4 pt-3 pb-1 text-xs text-(--color-fg-subtle)">
                  These stages will be cloned into every new batch pipeline that uses this template. Editing here does not affect existing pipelines.
                </p>

                <ul className="divide-y divide-(--color-card-border)">
                  {selected.stages.map((stage, idx) => (
                    <li key={stage.id} className="flex items-center gap-3 px-4 py-3">
                      <GripVertical className="h-4 w-4 text-(--color-fg-disabled) shrink-0 cursor-grab" />
                      <span className="w-5 text-xs text-(--color-fg-subtle) text-right shrink-0">
                        {idx + 1}
                      </span>

                      {editingStageId === stage.id ? (
                        <input
                          autoFocus
                          value={editingStageName}
                          onChange={(e) => setEditingStageName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameStage(stage.id);
                            if (e.key === "Escape") setEditingStageId(null);
                          }}
                          className="flex-1 h-8 rounded-lg bg-(--color-surface-2) px-3 text-sm text-(--color-fg) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                        />
                      ) : (
                        <span className="flex-1 text-sm text-(--color-fg)">{stage.name}</span>
                      )}

                      {stage.is_won && (
                        <span className="text-xs text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                          Won
                        </span>
                      )}
                      {stage.is_lost && (
                        <span className="text-xs text-red-600 font-medium bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                          Lost
                        </span>
                      )}

                      {editingStageId === stage.id ? (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleRenameStage(stage.id)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-(--color-success) hover:bg-(--color-surface-2)"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingStageId(null)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-2)"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingStageId(stage.id);
                              setEditingStageName(stage.name);
                            }}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleArchiveStage(stage.id)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-danger)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {showNewStage && (
                  <div className="px-4 py-3 border-t border-(--color-card-border) bg-(--color-surface-2)">
                    <input
                      autoFocus
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddStage();
                        if (e.key === "Escape") {
                          setShowNewStage(false);
                          setNewStageName("");
                        }
                      }}
                      placeholder="Stage name…"
                      className="w-full h-9 rounded-xl bg-(--color-surface-1) px-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:outline-none focus:ring-1 focus:ring-(--color-accent)"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleAddStage}
                        disabled={isPending || !newStageName.trim()}
                        className="flex-1 h-8 rounded-lg bg-(--color-accent) text-(--color-accent-fg) text-xs font-semibold disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowNewStage(false);
                          setNewStageName("");
                        }}
                        className="h-8 w-8 rounded-lg bg-(--color-surface-1) text-(--color-fg-muted) flex items-center justify-center"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-(--color-card-border) bg-(--color-surface-1) flex items-center justify-center h-40 text-sm text-(--color-fg-muted)">
                Select a template to edit its stages
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
