"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Inbox,
  Send,
  Layers,
  HelpCircle,
  Mail,
  Clock,
  ChevronRight,
  Paperclip,
  Loader2,
  Reply,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getThread,
  listThreads,
  markThreadRead,
  type InboxFilter,
  type InboxThread,
  type ThreadDetail,
} from "./actions";
import { ReplyComposer } from "./reply-composer";
import { getPrimaryAccount } from "./compose-actions";

const TABS: Array<{ id: InboxFilter; label: string; icon: React.ElementType }> = [
  { id: "primary", label: "Primary", icon: Inbox },
  { id: "unassigned", label: "Unassigned", icon: HelpCircle },
  { id: "sent", label: "Sent", icon: Send },
  { id: "all", label: "All", icon: Layers },
];

export function InboxView({
  initialThreads,
  initialTab,
  initialThreadId,
}: {
  initialThreads: InboxThread[];
  initialTab: InboxFilter;
  initialThreadId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<InboxFilter>(initialTab);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreadId ?? initialThreads[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [primaryAccount, setPrimaryAccount] = useState<{
    id: string;
    email_address: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  // Load primary account once
  useEffect(() => {
    getPrimaryAccount().then(setPrimaryAccount);
  }, []);

  // Load threads when tab changes
  useEffect(() => {
    listThreads(tab).then((list) => {
      setThreads(list);
      if (list.length > 0 && !list.find((t) => t.id === selectedId)) {
        setSelectedId(list[0].id);
      } else if (list.length === 0) {
        setSelectedId(null);
        setDetail(null);
      }
    });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    getThread(selectedId).then((d) => {
      setDetail(d);
      setLoadingDetail(false);
      if (d) {
        startTransition(() => {
          markThreadRead(selectedId).then(() => {
            setThreads((prev) =>
              prev.map((t) => (t.id === selectedId ? { ...t, unread_count: 0 } : t)),
            );
          });
        });
      }
    });
    // keep URL in sync
    const params = new URLSearchParams(searchParams?.toString());
    params.set("t", selectedId);
    params.set("tab", tab);
    router.replace(`/inbox?${params.toString()}`, { scroll: false });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Thread list */}
      <div className="w-95 shrink-0 border-r border-(--color-card-border) flex flex-col bg-(--color-surface-1)">
        {/* Tabs */}
        <div className="px-4 pt-6 pb-3">
          <h2 className="text-2xl font-bold text-(--color-fg) mb-4">Inbox</h2>
          <div className="flex gap-1 rounded-full bg-(--color-surface-2) p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-full transition-all",
                    active
                      ? "bg-(--color-accent) text-(--color-accent-fg) shadow-(--shadow-btn)"
                      : "text-(--color-fg-subtle) hover:text-(--color-fg)",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul>
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === selectedId}
                  onClick={() => setSelectedId(t.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto bg-(--color-bg)">
        {loadingDetail ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-(--color-fg-subtle)" />
          </div>
        ) : detail ? (
          <ThreadDetailView
            detail={detail}
            primaryEmail={primaryAccount?.email_address ?? null}
            onSent={() => {
              // Refresh the thread after send
              getThread(detail.id).then((d) => setDetail(d));
              listThreads(tab).then(setThreads);
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-(--color-fg-subtle)">
            Select a thread
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: InboxThread;
  active: boolean;
  onClick: () => void;
}) {
  const unread = thread.unread_count > 0;
  const preview = thread.last_message_snippet ?? "";
  const counterparty =
    thread.deal_name ?? thread.deal_company ?? thread.participants[0] ?? "—";

  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left px-4 py-3 border-b border-(--color-card-border) transition-colors",
          active
            ? "bg-(--color-accent)/10"
            : "hover:bg-(--color-surface-2)",
        )}
      >
        <div className="flex items-start gap-2">
          {unread && (
            <span className="mt-1.5 h-2 w-2 rounded-full bg-(--color-accent) shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className={cn("text-sm truncate", unread ? "font-bold text-(--color-fg)" : "font-medium text-(--color-fg)")}>
                {counterparty}
              </p>
              <span className="text-[11px] text-(--color-fg-subtle) shrink-0">
                {formatTime(thread.last_message_at)}
              </span>
            </div>
            <p className={cn("text-xs truncate mb-1", unread ? "font-semibold text-(--color-fg)" : "text-(--color-fg-muted)")}>
              {thread.subject ?? "(no subject)"}
            </p>
            <p className="text-xs text-(--color-fg-subtle) line-clamp-1">{preview}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              {thread.is_waiting_on_them && thread.awaiting_since && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-(--color-warn) bg-(--color-warn)/10 px-1.5 py-0.5 rounded-full">
                  <Clock className="h-2.5 w-2.5" />
                  Awaiting {formatAge(thread.awaiting_since)}
                </span>
              )}
              {thread.deal_id && thread.deal_name && (
                <span className="text-[10px] font-semibold text-(--color-accent) bg-(--color-accent)/10 px-1.5 py-0.5 rounded-full truncate">
                  {thread.deal_name}
                </span>
              )}
              {!thread.deal_id && (
                <span className="text-[10px] font-semibold text-(--color-fg-subtle) bg-(--color-surface-3) px-1.5 py-0.5 rounded-full">
                  Unassigned
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function ThreadDetailView({
  detail,
  primaryEmail,
  onSent,
}: {
  detail: ThreadDetail;
  primaryEmail: string | null;
  onSent: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-(--color-card-border)">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-(--color-fg) mb-1">
            {detail.subject ?? "(no subject)"}
          </h3>
          <p className="text-xs text-(--color-fg-subtle) truncate">
            {detail.participants.join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!showReply && (
            <button
              onClick={() => setShowReply(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-(--color-accent-fg) bg-(--color-accent) hover:opacity-90 px-3 py-1.5 rounded-full shadow-(--shadow-btn)"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
          {detail.deal_id && (
            <Link
              href={`/pipeline?deal=${detail.deal_id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-(--color-accent) hover:underline"
            >
              View deal
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {detail.messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
      </div>

      {showReply && (
        <ReplyComposer
          thread={detail}
          fromAddress={primaryEmail}
          onCancel={() => setShowReply(false)}
          onSent={() => {
            setShowReply(false);
            onSent();
          }}
        />
      )}
    </div>
  );
}

function MessageCard({ message }: { message: import("./actions").ThreadMessage }) {
  const [showHtml, setShowHtml] = useState(true);
  const isOutbound = message.direction === "outbound";
  const date = message.sent_at ?? message.received_at;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        isOutbound
          ? "border-(--color-accent)/30 bg-(--color-accent)/5"
          : "border-(--color-card-border) bg-(--color-surface-1)",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-(--color-fg)">
            {message.from_name ?? message.from_address ?? "Unknown"}
          </p>
          <p className="text-[11px] text-(--color-fg-subtle)">
            {isOutbound ? "Sent" : "From"} {message.from_address ?? ""}
            {message.to_addresses.length > 0 && (
              <> · To {message.to_addresses.join(", ")}</>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] text-(--color-fg-subtle)">
            {date ? new Date(date).toLocaleString() : ""}
          </span>
          {message.has_attachments && (
            <div className="flex items-center gap-1 mt-0.5 justify-end text-[11px] text-(--color-fg-subtle)">
              <Paperclip className="h-3 w-3" />
              attachments
            </div>
          )}
        </div>
      </div>

      {message.body_html && showHtml ? (
        <div
          className="text-sm text-(--color-fg) prose-sm max-w-none [&_a]:text-(--color-accent-text) [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.body_html) }}
        />
      ) : (
        <pre className="text-sm text-(--color-fg) whitespace-pre-wrap font-sans">
          {message.body_text ?? message.snippet ?? ""}
        </pre>
      )}

      {message.body_html && (
        <button
          onClick={() => setShowHtml((v) => !v)}
          className="mt-3 text-[11px] text-(--color-fg-subtle) hover:text-(--color-fg) underline"
        >
          {showHtml ? "Show plain text" : "Show formatted"}
        </button>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: InboxFilter }) {
  const messages: Record<InboxFilter, { title: string; body: string }> = {
    primary: {
      title: "No threads linked to your deals yet",
      body: "Connect a mailbox in Settings → Email to start syncing.",
    },
    unassigned: {
      title: "Nothing in triage",
      body: "Emails that don't auto-link to a deal will show up here.",
    },
    sent: {
      title: "No sent messages yet",
      body: "Messages you send from the CRM will appear here.",
    },
    all: {
      title: "Inbox is empty",
      body: "Once a mailbox is connected and synced, threads will appear here.",
    },
  };
  const m = messages[tab];
  return (
    <div className="px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-(--color-accent)/10 text-(--color-accent) flex items-center justify-center mx-auto mb-4">
        <Mail className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-(--color-fg) mb-1">{m.title}</p>
      <p className="text-xs text-(--color-fg-muted)">{m.body}</p>
      {tab === "primary" && (
        <Link
          href="/settings/email"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-(--color-accent) hover:underline"
        >
          Connect a mailbox
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 3600 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (3600 * 1000));
  if (hours >= 1) return `${hours}h`;
  return "now";
}

/**
 * Conservative HTML sanitizer for rendering email bodies.
 * Strips <script>, <style>, event handlers, and javascript: URLs.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\shref\s*=\s*"javascript:[^"]*"/gi, ' href="#"')
    .replace(/\shref\s*=\s*'javascript:[^']*'/gi, " href='#'");
}
