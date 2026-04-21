"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, FileText, AlertCircle, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmailTemplate } from "@/lib/types";
import { createTemplate, deleteTemplate, updateTemplate } from "./actions";
import { TEMPLATE_VARIABLE_HINTS, extractVariables } from "./template-utils";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; template: EmailTemplate }
  | null;

export function TemplatesView({
  initialTemplates,
}: {
  initialTemplates: EmailTemplate[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaved(tpl: EmailTemplate, mode: "create" | "edit") {
    setTemplates((prev) => {
      if (mode === "create") return [tpl, ...prev];
      return prev.map((t) => (t.id === tpl.id ? tpl : t));
    });
    setEditor(null);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setPendingDelete(null);
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-12 max-w-3xl mx-auto w-full">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-(--color-fg-subtle) hover:text-(--color-fg) mb-4"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to settings
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
              Email Templates
            </h2>
            <p className="text-(--color-fg-muted) text-sm">
              Reusable subject + body snippets with <code className="text-xs bg-(--color-surface-2) px-1 py-0.5 rounded">{"{{variables}}"}</code> that expand from the active deal.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5" />
            New template
          </Button>
        </div>

        <div className="rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-card-3d) p-6">
          {templates.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="h-10 w-10 text-(--color-fg-subtle) mx-auto mb-3" />
              <p className="text-sm text-(--color-fg-muted) mb-4">
                No templates yet. Create one to speed up email follow-ups.
              </p>
              <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                <Plus className="h-3.5 w-3.5" />
                Create your first template
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-4 rounded-xl bg-(--color-surface-2) px-4 py-3 hover:bg-(--color-surface-3) transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-(--color-accent)/15 text-(--color-accent) flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--color-fg) truncate">{t.name}</p>
                    <p className="text-xs text-(--color-fg-muted) truncate">{t.subject}</p>
                    {t.variables.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.variables.map((v) => (
                          <span
                            key={v}
                            className="text-[10px] uppercase tracking-wider font-semibold text-(--color-accent) bg-(--color-accent)/10 px-1.5 py-0.5 rounded"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditor({ mode: "edit", template: t })}
                      className="h-8 w-8 rounded-lg text-(--color-fg-subtle) hover:text-(--color-fg) hover:bg-(--color-surface-1) flex items-center justify-center"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(t)}
                      className="h-8 w-8 rounded-lg text-(--color-fg-subtle) hover:text-(--color-danger) hover:bg-(--color-danger)/10 flex items-center justify-center"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editor && (
        <TemplateEditor
          state={editor}
          onCancel={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-(--color-fg-muted)">
              &ldquo;{pendingDelete?.name}&rdquo; will be removed. Existing logged activities that used it are not affected.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => pendingDelete && handleDelete(pendingDelete.id)}
              disabled={isPending}
              className="bg-(--color-danger) hover:bg-(--color-danger)/90"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Editor dialog
// ───────────────────────────────────────────────────────────────────

function TemplateEditor({
  state,
  onCancel,
  onSaved,
}: {
  state: Exclude<EditorState, null>;
  onCancel: () => void;
  onSaved: (t: EmailTemplate, mode: "create" | "edit") => void;
}) {
  const initial = state.mode === "edit" ? state.template : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body_html ?? "");
  const [isShared, setIsShared] = useState(initial?.is_shared ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const detectedVars = useMemo(() => extractVariables(subject, body), [subject, body]);

  function submit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (!subject.trim()) { setError("Subject is required"); return; }

    startTransition(async () => {
      try {
        if (state.mode === "create") {
          const tpl = await createTemplate({
            name, subject, body_html: body, is_shared: isShared,
          });
          onSaved(tpl, "create");
        } else {
          const tpl = await updateTemplate(state.template.id, {
            name, subject, body_html: body, is_shared: isShared,
          });
          onSaved(tpl, "edit");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save template");
      }
    });
  }

  function insertVariable(v: string) {
    setBody((b) => `${b}${b.endsWith(" ") || b === "" ? "" : " "}{{${v}}}`);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{state.mode === "create" ? "New template" : "Edit template"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Intro follow-up, pricing recap, …"
                className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Hey {{first_name}} — following up"
                className="h-10 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder={"Hi {{first_name}},\n\nThanks for your time yesterday…"}
                className="w-full rounded-xl border-0 bg-(--color-surface-2) px-4 py-3 text-sm text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none resize-y"
              />
            </div>

            <div className="rounded-xl bg-(--color-surface-2) p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-2">
                Insert variable
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLE_HINTS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-xs font-medium text-(--color-accent) bg-(--color-accent)/10 hover:bg-(--color-accent)/20 px-2 py-1 rounded-lg transition-colors"
                    title={v.help}
                  >
                    {"{{"}{v.key}{"}}"}
                  </button>
                ))}
              </div>
              {detectedVars.length > 0 && (
                <p className="mt-2 text-[11px] text-(--color-fg-subtle)">
                  Detected in template: {detectedVars.join(", ")}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-(--color-fg-muted) cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="accent-(--color-accent)"
              />
              Share with teammates in this company
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-(--color-danger)/10 text-(--color-danger) px-4 py-3 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={isPending}>
            <Save className="h-3.5 w-3.5" />
            {isPending ? "Saving…" : state.mode === "create" ? "Create template" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
