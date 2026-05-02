"use client";

import { useState, useTransition } from "react";
import { Send, X, Loader2, Minus, Eye, MousePointerClick } from "lucide-react";
import { sendEmail } from "./compose-actions";

export function ComposeModal({
  accountId,
  fromAddress,
  onClose,
  onSent,
  initialTo = "",
  initialSubject = "",
  initialBody = "",
}: {
  accountId: string | null;
  fromAddress: string | null;
  onClose: () => void;
  onSent: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [sending, startSending] = useTransition();

  function handleSend() {
    setError(null);
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    const ccList = cc.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) {
      setError("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required");
      return;
    }
    const html = body
      .split(/\n\n+/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
      .join("");
    startSending(async () => {
      const res = await sendEmail({
        to: toList,
        cc: ccList.length > 0 ? ccList : undefined,
        subject: subject.trim(),
        bodyHtml: html,
        accountId: accountId ?? undefined,
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

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-80 bg-(--color-surface-1) border border-(--color-border) rounded-t-xl ">
        <div className="flex items-center justify-between px-4 py-2 border-b border-(--color-border)">
          <button
            onClick={() => setMinimized(false)}
            className="text-sm font-semibold text-(--color-fg) truncate"
          >
            {subject || "New message"}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-(--color-surface-2)"
            >
              <X className="h-3.5 w-3.5 text-(--color-fg-muted)" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 w-135 max-w-[calc(100vw-48px)] bg-(--color-surface-1) border border-(--color-border) rounded-t-xl  flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-(--color-surface-2) rounded-t-xl">
        <p className="text-sm font-semibold text-(--color-fg)">
          New message
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-(--color-surface-3)"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5 text-(--color-fg-muted)" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-(--color-surface-3)"
            title="Close"
          >
            <X className="h-3.5 w-3.5 text-(--color-fg-muted)" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col overflow-hidden">
        {fromAddress && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-(--color-border)">
            <span className="text-[11px] font-semibold text-(--color-fg-subtle) w-12">
              From
            </span>
            <span className="text-xs text-(--color-fg-muted) truncate">
              {fromAddress}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-(--color-border)">
          <span className="text-[11px] font-semibold text-(--color-fg-subtle) w-12">
            To
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 text-sm text-(--color-fg) bg-transparent outline-none placeholder:text-(--color-fg-subtle)"
          />
          {!showCc && (
            <button
              onClick={() => setShowCc(true)}
              className="text-[11px] font-semibold text-(--color-fg-subtle) hover:text-(--color-fg)"
            >
              Cc
            </button>
          )}
        </div>
        {showCc && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-(--color-border)">
            <span className="text-[11px] font-semibold text-(--color-fg-subtle) w-12">
              Cc
            </span>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="flex-1 text-sm text-(--color-fg) bg-transparent outline-none placeholder:text-(--color-fg-subtle)"
            />
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-(--color-border)">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-sm font-semibold text-(--color-fg) bg-transparent outline-none placeholder:text-(--color-fg-subtle)"
          />
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          rows={14}
          className="flex-1 min-h-60 px-4 py-3 text-sm text-(--color-fg) bg-transparent outline-none resize-none placeholder:text-(--color-fg-subtle)"
        />

        {error && (
          <p className="px-4 py-2 text-xs text-(--color-danger) bg-(--color-danger)/10 border-t border-(--color-border)">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-(--color-border) bg-(--color-surface-2)">
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-(--color-accent) text-(--color-accent-fg) text-sm font-semibold  hover:opacity-90 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTrackOpens((v) => !v)}
              className={`p-2 rounded-full hover:bg-(--color-surface-3) ${trackOpens ? "text-(--color-blue)" : "text-(--color-fg-subtle)"}`}
              title={trackOpens ? "Open tracking on" : "Open tracking off"}
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTrackClicks((v) => !v)}
              className={`p-2 rounded-full hover:bg-(--color-surface-3) ${trackClicks ? "text-(--color-blue)" : "text-(--color-fg-subtle)"}`}
              title={trackClicks ? "Click tracking on" : "Click tracking off"}
            >
              <MousePointerClick className="h-4 w-4" />
            </button>
          </div>
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
