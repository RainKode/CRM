"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plug, Unplug, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginConnectMailbox, disconnectMailbox, listAccounts, type EmailAccount } from "./actions";

const PROVIDERS: Array<{ id: "gmail" | "outlook" | "imap"; label: string }> = [
  { id: "gmail", label: "Gmail" },
  { id: "outlook", label: "Outlook" },
  { id: "imap", label: "Other (IMAP)" },
];

export function EmailSettingsView({
  accounts: initialAccounts,
  justConnected,
  authError,
}: {
  accounts: EmailAccount[];
  justConnected: boolean;
  authError: string | null;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [connecting, startConnecting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(
    justConnected ? "Mailbox connected. Backfilling recent messages…" : null,
  );

  // Poll sync progress while any account is backfilling
  useEffect(() => {
    const hasActive = accounts.some((a) => a.sync_state === "backfilling");
    if (!hasActive) return;
    const t = setInterval(async () => {
      const fresh = await listAccounts();
      setAccounts(fresh);
      if (!fresh.some((a) => a.sync_state === "backfilling")) {
        setBanner(null);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [accounts, router]);

  function handleConnect(provider: "gmail" | "outlook" | "imap") {
    setError(null);
    startConnecting(async () => {
      try {
        const { url } = await beginConnectMailbox({ provider });
        window.location.href = url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start connect flow");
      }
    });
  }

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this mailbox? Existing threads and messages stay in the CRM.")) return;
    await disconnectMailbox(id);
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "disconnected" } : a)));
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="pt-8 pb-12 px-6 md:px-12 max-w-3xl mx-auto w-full">
        <h2 className="text-3xl font-bold text-(--color-fg) tracking-tight mb-1">
          Email Accounts
        </h2>
        <p className="text-(--color-fg-muted) text-sm mb-8">
          Connect a mailbox so the CRM can send, receive, and thread email against your deals.
        </p>

        {banner && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-(--color-accent)/30 bg-(--color-accent)/10 p-4 text-sm text-(--color-fg)">
            <Loader2 className="h-4 w-4 animate-spin text-(--color-accent) shrink-0 mt-0.5" />
            <div>{banner}</div>
          </div>
        )}
        {authError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-(--color-danger)/30 bg-(--color-danger)/10 p-4 text-sm text-(--color-danger)">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            Authentication failed or was cancelled. Try again.
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-(--color-danger)/30 bg-(--color-danger)/10 p-4 text-sm text-(--color-danger)">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Connected accounts */}
        <div className="rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-card-3d) p-6 mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-4">
            Connected
          </h3>
          {accounts.length === 0 ? (
            <p className="text-sm text-(--color-fg-muted) py-6 text-center">
              No mailbox connected yet. Pick a provider below to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-4 rounded-xl bg-(--color-surface-2) px-4 py-3"
                >
                  <div className="h-10 w-10 rounded-full bg-(--color-accent)/15 text-(--color-accent) flex items-center justify-center">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--color-fg) truncate">
                      {a.email_address}
                    </p>
                    <p className="text-xs text-(--color-fg-subtle) capitalize">
                      {a.provider} · {renderStatus(a)}
                    </p>
                  </div>
                  {a.sync_state === "backfilling" && (
                    <div className="w-32 hidden sm:block">
                      <div className="h-1.5 rounded-full bg-(--color-surface-3) overflow-hidden">
                        <div
                          className="h-full bg-(--color-accent) transition-all"
                          style={{ width: `${a.sync_progress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-(--color-fg-subtle) mt-1 text-right">
                        Syncing {a.sync_progress}%
                      </p>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDisconnect(a.id)}
                    disabled={a.status === "disconnected"}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    {a.status === "disconnected" ? "Disconnected" : "Disconnect"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Connect new */}
        <div className="rounded-2xl border-2 border-(--color-card-border) bg-(--color-surface-1) shadow-(--shadow-card-3d) p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-(--color-fg-subtle) mb-1">
            Connect a mailbox
          </h3>
          <p className="text-xs text-(--color-fg-muted) mb-4">
            We never store your password — Unipile handles OAuth. We only store message
            metadata and bodies inside your CRM.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleConnect(p.id)}
                disabled={connecting}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-(--color-card-border) bg-(--color-surface-2) px-4 py-6 text-sm font-semibold text-(--color-fg) hover:border-(--color-accent) hover:bg-(--color-accent)/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Plug className="h-5 w-5 text-(--color-accent)" />
                )}
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderStatus(a: EmailAccount): string {
  if (a.status === "disconnected") return "Disconnected";
  if (a.status === "error") return "Error — needs reconnect";
  switch (a.sync_state) {
    case "backfilling":
      return `Syncing recent mail…`;
    case "error":
      return "Sync error";
    default:
      return a.last_sync_at ? `Synced · ${new Date(a.last_sync_at).toLocaleString()}` : "Connected";
  }
}
