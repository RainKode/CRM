"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailTemplate } from "@/lib/types";
import { getTemplateContext, listTemplates } from "@/app/(authenticated)/settings/templates/actions";
import { applyTemplate } from "@/app/(authenticated)/settings/templates/template-utils";

/**
 * Button + menu for picking an email template and substituting `{{vars}}` against
 * the current deal. On select, invokes `onInsert` with the rendered subject/body
 * so the parent (QuickLogPopover) can drop them into its own inputs.
 *
 * The template list is loaded lazily on first open to keep the popover snappy.
 */
export function TemplateInserter({
  dealId,
  onInsert,
}: {
  dealId: string;
  onInsert: (args: { subject: string; body: string; templateId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || templates) return;
    startTransition(async () => {
      try {
        const t = await listTemplates();
        setTemplates(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load templates");
      }
    });
  }, [open, templates]);

  function handlePick(tpl: EmailTemplate) {
    setOpen(false);
    startTransition(async () => {
      try {
        const ctx = await getTemplateContext(dealId);
        const subject = applyTemplate(tpl.subject, ctx as unknown as Record<string, string>);
        const body = applyTemplate(tpl.body_html, ctx as unknown as Record<string, string>);
        onInsert({ subject, body, templateId: tpl.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to render template");
      }
    });
  }

  const filtered = (templates ?? []).filter((t) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-(--color-accent) hover:text-(--color-accent-hover)"
      >
        <FileText className="h-3.5 w-3.5" />
        Insert template
      </button>

      {open && (
        <div
          className="absolute z-110 right-0 mt-1 w-72 rounded-xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-popover) p-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="h-8 w-full rounded-lg border-0 bg-(--color-surface-2) pl-7 pr-2 text-xs text-(--color-fg) focus:ring-1 focus:ring-(--color-accent) focus:outline-none"
            />
          </div>

          {isPending && !templates && (
            <div className="py-6 flex items-center justify-center text-(--color-fg-subtle)">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {templates && filtered.length === 0 && (
            <p className="text-xs text-(--color-fg-muted) text-center py-4 px-2">
              {templates.length === 0
                ? "No templates yet. Create one in Settings → Email templates."
                : "No matches."}
            </p>
          )}

          {filtered.length > 0 && (
            <ul className="max-h-64 overflow-auto">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(t)}
                    className={cn(
                      "w-full text-left rounded-lg px-2 py-2 hover:bg-(--color-surface-2)",
                    )}
                  >
                    <p className="text-xs font-semibold text-(--color-fg) truncate">{t.name}</p>
                    <p className="text-[11px] text-(--color-fg-subtle) truncate">{t.subject}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-2 text-[11px] text-(--color-danger) px-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
