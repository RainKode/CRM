"use client";

import { useState, useTransition } from "react";
import { Send, X, Loader2, Eye, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendEmail } from "./compose-actions";
import type { ThreadDetail } from "./actions";

export function ReplyComposer({
  thread,
  fromAddress,
  onSent,
  onCancel,
}: {
  thread: ThreadDetail;
  fromAddress: string | null;
  onSent: () => void;
  onCancel: () => void;
}) {
  // Derive reply target: last inbound message in the thread, else last message
  const lastInbound = [...thread.messages]
    .reverse()
    .find((m) => m.direction === "inbound");
  const parent = lastInbound ?? thread.messages[thread.messages.length - 1];

  const defaultTo = parent?.from_address
    ? [parent.from_address]
    : thread.participants.filter((p) => p !== fromAddress?.toLowerCase());

  const defaultSubject = thread.subject
    ? thread.subject.toLowerCase().startsWith("re:")
      ? thread.subject
      : `Re: ${thread.subject}`
    : "";

  const [to, setTo] = useState<string>(defaultTo.join(", "));
  const [subject, setSubject] = useState<string>(defaultSubject);
  const [body, setBody] = useState<string>("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  function handleSend() {
    setError(null);
    const toList = to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (toList.length === 0) {
      setError("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required");
      return;
    }
    if (!body.trim()) {
      setError("Write a message");
      return;
    }

    // Wrap plain-text body into simple HTML paragraphs
    const bodyHtml = body
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");

    startSending(async () => {
      const res = await sendEmail({
        to: toList,
        subject,
        bodyHtml,
        threadId: thread.id,
        replyToMessageId: parent?.id ?? null,
        dealId: thread.deal_id,
        leadId: thread.lead_id,
        trackOpens,
        trackClicks,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSent();
    });
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-(--color-accent)/30 bg-(--color-surface-1) shadow-(--shadow-card-3d) overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-(--color-card-border) bg-(--color-surface-2)">
        <p className="text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
          {fromAddress ? `Reply from ${fromAddress}` : "Reply"}
        </p>
        <button
          onClick={onCancel}
          className="text-(--color-fg-subtle) hover:text-(--color-fg)"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-(--color-fg-subtle) w-14 shrink-0">
            To
          </label>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            disabled={sending}
            className="text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-(--color-fg-subtle) w-14 shrink-0">
            Subject
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
            className="text-sm"
          />
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your reply…"
          disabled={sending}
          rows={8}
          className="w-full rounded-xl bg-(--color-surface-2) border border-(--color-card-border) px-4 py-3 text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none focus:ring-2 focus:ring-(--color-accent) resize-y font-sans"
        />

        {error && (
          <p className="text-xs text-(--color-danger) font-semibold">{error}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-4 text-xs text-(--color-fg-subtle)">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-(--color-fg)">
              <input
                type="checkbox"
                checked={trackOpens}
                onChange={(e) => setTrackOpens(e.target.checked)}
                className="accent-(--color-accent)"
              />
              <Eye className="h-3 w-3" />
              Track opens
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-(--color-fg)">
              <input
                type="checkbox"
                checked={trackClicks}
                onChange={(e) => setTrackClicks(e.target.checked)}
                className="accent-(--color-accent)"
              />
              <MousePointerClick className="h-3 w-3" />
              Track clicks
            </label>
          </div>

          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
