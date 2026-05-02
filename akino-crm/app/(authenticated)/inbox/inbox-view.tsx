"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Inbox,
  Send,
  HelpCircle,
  Mail,
  Clock,
  ChevronRight,
  Paperclip,
  Loader2,
  Reply,
  Star,
  Archive,
  Trash2,
  MailOpen,
  Search,
  RotateCw,
  PencilLine,
  Layers,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  archiveThreads,
  getThread,
  listThreads,
  markManyRead,
  markThreadRead,
  markThreadUnread,
  restoreThreads,
  setThreadStarred,
  trashThreads,
  type InboxFilter,
  type InboxThread,
  type ThreadDetail,
} from "./actions";
import { ReplyComposer } from "./reply-composer";
import { ComposeModal } from "./compose-modal";
import { getPrimaryAccount } from "./compose-actions";

type Label = {
  id: InboxFilter;
  label: string;
  icon: React.ElementType;
};

const LABELS: Label[] = [
  { id: "primary", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "unassigned", label: "Unassigned", icon: HelpCircle },
  { id: "all", label: "All mail", icon: Layers },
  { id: "archived", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
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
  const [search, setSearch] = useState<string>("");
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [primaryAccount, setPrimaryAccount] = useState<{
    id: string;
    email_address: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    getPrimaryAccount().then(setPrimaryAccount);
  }, []);

  // Reload thread list when tab or search changes.
  useEffect(() => {
    setLoadingList(true);
    listThreads(tab, search).then((list) => {
      setThreads(list);
      setLoadingList(false);
      setChecked(new Set());
    });
  }, [tab, search]);

  // Load detail when selection changes.
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
              prev.map((t) =>
                t.id === selectedId ? { ...t, unread_count: 0 } : t,
              ),
            );
          });
        });
      }
    });
    const params = new URLSearchParams(searchParams?.toString());
    params.set("t", selectedId);
    params.set("tab", tab);
    router.replace(`/inbox?${params.toString()}`, { scroll: false });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadByTab = useMemo(() => {
    return threads.reduce<Record<string, number>>(
      (acc, t) => {
        if (t.unread_count > 0) acc[tab] = (acc[tab] ?? 0) + 1;
        return acc;
      },
      {},
    );
  }, [threads, tab]);

  function refreshList() {
    setLoadingList(true);
    listThreads(tab, search).then((list) => {
      setThreads(list);
      setLoadingList(false);
      setChecked(new Set());
    });
  }

  // ─── Bulk actions ───────────────────────────────────────────────────
  async function bulkArchive() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setThreads((p) => p.filter((t) => !checked.has(t.id)));
    setChecked(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    await archiveThreads(ids);
  }
  async function bulkTrash() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setThreads((p) => p.filter((t) => !checked.has(t.id)));
    setChecked(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    await trashThreads(ids);
  }
  async function bulkRestore() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setThreads((p) => p.filter((t) => !checked.has(t.id)));
    setChecked(new Set());
    await restoreThreads(ids);
  }
  async function bulkMarkRead(read: boolean) {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setThreads((p) =>
      p.map((t) =>
        checked.has(t.id)
          ? { ...t, unread_count: read ? 0 : 1 }
          : t,
      ),
    );
    setChecked(new Set());
    await markManyRead(ids, read);
  }

  async function toggleStar(thread: InboxThread) {
    const next = !thread.is_starred;
    setThreads((p) =>
      p.map((t) => (t.id === thread.id ? { ...t, is_starred: next } : t)),
    );
    await setThreadStarred(thread.id, next);
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setChecked((prev) =>
      prev.size === threads.length ? new Set() : new Set(threads.map((t) => t.id)),
    );
  }

  const anyChecked = checked.size > 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-(--color-bg)">
      {/* ─── Left nav rail ──────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-(--color-border) bg-(--color-surface-1) flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-(--color-accent) text-(--color-accent-fg) font-semibold text-sm px-4 py-2.5 rounded-2xl  hover:opacity-90"
          >
            <PencilLine className="h-4 w-4" />
            Compose
          </button>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {LABELS.map((l) => {
            const Icon = l.icon;
            const active = tab === l.id;
            const count = active ? unreadByTab[tab] ?? 0 : 0;
            return (
              <button
                key={l.id}
                onClick={() => {
                  setTab(l.id);
                  setSelectedId(null);
                }}
                className={cn(
                  "w-full flex items-center gap-3 pl-4 pr-3 py-1.5 rounded-r-full text-sm transition-colors",
                  active
                    ? "bg-(--color-blue)/12 text-(--color-fg) font-semibold"
                    : "text-(--color-fg-muted) hover:bg-(--color-surface-2)",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left truncate">{l.label}</span>
                {count > 0 && (
                  <span className="text-[11px] font-bold">{count}</span>
                )}
              </button>
            );
          })}
        </nav>
        {primaryAccount && (
          <div className="px-4 py-3 border-t border-(--color-border) text-[11px] text-(--color-fg-subtle) truncate">
            {primaryAccount.email_address}
          </div>
        )}
      </aside>

      {/* ─── Main pane ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar */}
        <div className="shrink-0 h-14 border-b border-(--color-border) bg-(--color-surface-1) flex items-center gap-2 px-4">
          {detail ? (
            <>
              <button
                onClick={() => setSelectedId(null)}
                className="p-2 rounded-full hover:bg-(--color-surface-2)"
                title="Back to list"
              >
                <ArrowLeft className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
              <div className="h-5 w-px bg-(--color-card-border) mx-1" />
              <button
                onClick={async () => {
                  await archiveThreads([detail.id]);
                  setSelectedId(null);
                  refreshList();
                }}
                className="p-2 rounded-full hover:bg-(--color-surface-2)"
                title="Archive"
              >
                <Archive className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
              <button
                onClick={async () => {
                  await trashThreads([detail.id]);
                  setSelectedId(null);
                  refreshList();
                }}
                className="p-2 rounded-full hover:bg-(--color-surface-2)"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
              <button
                onClick={async () => {
                  await markThreadUnread(detail.id);
                  setSelectedId(null);
                  refreshList();
                }}
                className="p-2 rounded-full hover:bg-(--color-surface-2)"
                title="Mark as unread"
              >
                <MailOpen className="h-4 w-4 text-(--color-fg-muted)" />
              </button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-(--color-surface-2) cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-(--color-accent)"
                  checked={threads.length > 0 && checked.size === threads.length}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        checked.size > 0 && checked.size < threads.length;
                  }}
                  onChange={toggleAll}
                />
              </label>
              <button
                onClick={refreshList}
                className="p-2 rounded-full hover:bg-(--color-surface-2)"
                title="Refresh"
              >
                <RotateCw
                  className={cn(
                    "h-4 w-4 text-(--color-fg-muted)",
                    loadingList && "animate-spin",
                  )}
                />
              </button>
              {anyChecked && (
                <>
                  <div className="h-5 w-px bg-(--color-card-border) mx-1" />
                  {tab === "trash" || tab === "archived" ? (
                    <button
                      onClick={bulkRestore}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-(--color-surface-2) text-xs font-semibold text-(--color-fg-muted)"
                    >
                      <Inbox className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={bulkArchive}
                      className="p-2 rounded-full hover:bg-(--color-surface-2)"
                      title="Archive"
                    >
                      <Archive className="h-4 w-4 text-(--color-fg-muted)" />
                    </button>
                  )}
                  <button
                    onClick={bulkTrash}
                    className="p-2 rounded-full hover:bg-(--color-surface-2)"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-(--color-fg-muted)" />
                  </button>
                  <button
                    onClick={() => bulkMarkRead(true)}
                    className="p-2 rounded-full hover:bg-(--color-surface-2)"
                    title="Mark read"
                  >
                    <MailOpen className="h-4 w-4 text-(--color-fg-muted)" />
                  </button>
                  <button
                    onClick={() => bulkMarkRead(false)}
                    className="p-2 rounded-full hover:bg-(--color-surface-2) text-xs font-semibold text-(--color-fg-muted) px-3"
                    title="Mark unread"
                  >
                    Unread
                  </button>
                  <span className="ml-2 text-xs text-(--color-fg-subtle)">
                    {checked.size} selected
                  </span>
                </>
              )}
            </>
          )}

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-80 max-w-[40%]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--color-fg-subtle)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail"
              className="w-full h-9 pl-9 pr-3 rounded-full bg-(--color-surface-2) text-sm text-(--color-fg) placeholder:text-(--color-fg-subtle) outline-none focus:ring-2 focus:ring-(--color-blue)/40"
            />
          </div>
        </div>

        {/* List OR detail */}
        {detail ? (
          <div className="flex-1 overflow-y-auto">
            {loadingDetail ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-(--color-fg-subtle)" />
              </div>
            ) : (
              <ThreadDetailView
                detail={detail}
                primaryEmail={primaryAccount?.email_address ?? null}
                onSent={() => {
                  getThread(detail.id).then((d) => setDetail(d));
                  refreshList();
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {loadingList && threads.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-(--color-fg-subtle)" />
              </div>
            ) : threads.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <ul className="divide-y divide-(--color-card-border)">
                {threads.map((t) => (
                  <GmailRow
                    key={t.id}
                    thread={t}
                    checked={checked.has(t.id)}
                    onCheck={() => toggleCheck(t.id)}
                    onStar={() => toggleStar(t)}
                    onOpen={() => setSelectedId(t.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeModal
          accountId={primaryAccount?.id ?? null}
          fromAddress={primaryAccount?.email_address ?? null}
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            refreshList();
          }}
        />
      )}
    </div>
  );
}

// ─── Gmail-style single row ─────────────────────────────────────────────
function GmailRow({
  thread,
  checked,
  onCheck,
  onStar,
  onOpen,
}: {
  thread: InboxThread;
  checked: boolean;
  onCheck: () => void;
  onStar: () => void;
  onOpen: () => void;
}) {
  const unread = thread.unread_count > 0;
  const sender =
    thread.last_from_name ??
    thread.last_from_address ??
    thread.participants[0] ??
    "—";
  const preview = thread.last_message_snippet ?? "";
  const subject = thread.subject ?? "(no subject)";

  return (
    <li
      className={cn(
        "group flex items-center gap-3 pl-4 pr-4 py-2 cursor-pointer transition-colors border-l-2",
        checked
          ? "bg-(--color-blue)/10 border-(--color-blue)"
          : unread
            ? "bg-(--color-surface-1) border-transparent hover:z-10"
            : "bg-(--color-bg) border-transparent hover:z-10",
      )}
      onClick={onOpen}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onCheck}
        className="h-4 w-4 accent-(--color-accent)"
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        className="shrink-0"
        title={thread.is_starred ? "Unstar" : "Star"}
      >
        <Star
          className={cn(
            "h-4 w-4 transition-colors",
            thread.is_starred
              ? "fill-amber-400 text-amber-400"
              : "text-(--color-fg-subtle) hover:text-(--color-fg-muted)",
          )}
        />
      </button>

      <div
        className={cn(
          "w-44 shrink-0 truncate text-sm",
          unread
            ? "font-bold text-(--color-fg)"
            : "font-medium text-(--color-fg-muted)",
        )}
      >
        {sender}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {thread.deal_id && thread.deal_name && (
          <span className="shrink-0 text-[10px] font-semibold text-(--color-blue) bg-(--color-blue)/12 px-1.5 py-0.5 rounded">
            {thread.deal_name}
          </span>
        )}
        <span
          className={cn(
            "truncate text-sm",
            unread
              ? "font-semibold text-(--color-fg)"
              : "text-(--color-fg-muted)",
          )}
        >
          {subject}
        </span>
        {preview && (
          <span className="truncate text-sm text-(--color-fg-subtle)">
            {" "}
            — {preview}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {thread.is_waiting_on_them && thread.awaiting_since && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-(--color-warn) bg-(--color-warn)/10 px-1.5 py-0.5 rounded-full">
            <Clock className="h-2.5 w-2.5" />
            {formatAge(thread.awaiting_since)}
          </span>
        )}
        <span
          className={cn(
            "text-[11px] shrink-0 w-16 text-right",
            unread
              ? "font-bold text-(--color-fg)"
              : "text-(--color-fg-subtle)",
          )}
        >
          {formatTime(thread.last_message_at)}
        </span>
      </div>
    </li>
  );
}

// ─── Detail view (kept, minor tweaks) ───────────────────────────────────
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
    <div className="max-w-4xl mx-auto px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-(--color-border)">
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
              className="flex items-center gap-1.5 text-xs font-semibold text-(--color-accent-fg) bg-(--color-accent) hover:opacity-90 px-3 py-1.5 rounded-full "
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
          {detail.deal_id && (
            <Link
              href={`/pipeline?deal=${detail.deal_id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-(--color-blue) hover:underline"
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
          ? "border-(--color-blue)/30 bg-(--color-blue)/8"
          : "border-(--color-border) bg-(--color-surface-1)",
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
      title: "Your inbox is empty",
      body: "Connect a mailbox in Settings → Email to start syncing.",
    },
    starred: {
      title: "No starred threads",
      body: "Click the star icon on any thread to bookmark it.",
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
      title: "No mail",
      body: "Once a mailbox is connected and synced, threads will appear here.",
    },
    archived: {
      title: "Archive is empty",
      body: "Threads you mark as done will move here.",
    },
    trash: {
      title: "Trash is empty",
      body: "Deleted threads will show up here until permanently removed.",
    },
  };
  const m = messages[tab];
  return (
    <div className="px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-(--color-blue)/12 text-(--color-blue) flex items-center justify-center mx-auto mb-4">
        <Mail className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-(--color-fg) mb-1">{m.title}</p>
      <p className="text-xs text-(--color-fg-muted)">{m.body}</p>
      {tab === "primary" && (
        <Link
          href="/settings/email"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-(--color-blue) hover:underline"
        >
          Connect a mailbox
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────
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
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 3600 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (3600 * 1000));
  if (hours >= 1) return `${hours}h`;
  return "now";
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\shref\s*=\s*"javascript:[^"]*"/gi, ' href="#"')
    .replace(/\shref\s*=\s*'javascript:[^']*'/gi, " href='#'");
}
