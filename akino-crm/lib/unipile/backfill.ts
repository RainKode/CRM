/**
 * Initial backfill for a freshly-connected mailbox.
 *
 * Runs server-side with the service-role client so we can write regardless
 * of the RLS context (the triggering request is the CRM owner, but the fetch
 * loop may outlive the request).
 *
 * Backfills the last 90 days, 200 messages per page, with gentle backoff.
 * Progress is persisted to email_accounts.sync_progress (0..100).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { listMails, type UnipileMail } from "./client";
import { ingestUnipileMail, type StoredAccountRow } from "./ingest";

const BACKFILL_DAYS = 90;
const PAGE_SIZE = 200;
const MAX_PAGES = 25; // safety cap → ~5000 messages
const INITIAL_BACKOFF_MS = 500;

export async function backfillAccount(accountId: string): Promise<void> {
  const sb = createAdminClient();

  const { data: row, error } = await sb
    .from("email_accounts")
    .select("id, company_id, user_id, email_address, unipile_account_id")
    .eq("id", accountId)
    .single();

  if (error || !row) {
    console.error("[backfill] account not found", accountId, error);
    return;
  }

  const account = row as StoredAccountRow;

  await sb
    .from("email_accounts")
    .update({ sync_state: "backfilling", sync_progress: 1, sync_error: null })
    .eq("id", accountId);

  const after = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let cursor: string | undefined;
  let page = 0;
  let processed = 0;

  try {
    for (; page < MAX_PAGES; page++) {
      const res = await withRetry(() =>
        listMails({
          account_id: account.unipile_account_id,
          limit: PAGE_SIZE,
          cursor,
          after,
        }),
      );

      const items: UnipileMail[] = res.items ?? [];
      for (const mail of items) {
        try {
          await ingestUnipileMail(sb, account, mail);
        } catch (err) {
          console.error("[backfill] ingest failed", mail.id, err);
        }
      }
      processed += items.length;

      const progress = Math.min(99, 5 + Math.round((page + 1) * (95 / MAX_PAGES)));
      await sb
        .from("email_accounts")
        .update({ sync_progress: progress })
        .eq("id", accountId);

      if (!res.cursor || items.length === 0) break;
      cursor = res.cursor;
    }

    await sb
      .from("email_accounts")
      .update({
        sync_state: "idle",
        sync_progress: 100,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    console.log(`[backfill] ${account.email_address} → ${processed} messages`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[backfill] failed", accountId, msg);
    await sb
      .from("email_accounts")
      .update({ sync_state: "error", sync_error: msg })
      .eq("id", accountId);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = INITIAL_BACKOFF_MS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw lastErr;
}
