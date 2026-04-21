"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import {
  createHostedAuthLink,
  deleteAccount as deleteUnipileAccount,
  getAccount,
  providerFromUnipileType,
} from "@/lib/unipile/client";
import { backfillAccount } from "@/lib/unipile/backfill";

export type EmailAccount = {
  id: string;
  email_address: string;
  provider: string;
  status: string;
  sync_state: string;
  sync_progress: number;
  last_sync_at: string | null;
  created_at: string;
};

export async function listAccounts(): Promise<EmailAccount[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await sb
    .from("email_accounts")
    .select("id, email_address, provider, status, sync_state, sync_progress, last_sync_at, created_at")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as EmailAccount[];
}

/**
 * Starts Unipile hosted auth. Returns a URL the user opens in a popup.
 * On successful connect Unipile POSTs to our webhook with event
 * `account.created` — that handler stores the row.
 */
export async function beginConnectMailbox(opts?: {
  provider?: "gmail" | "outlook" | "imap";
}): Promise<{ url: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const companyId = await getActiveCompanyId();

  const base = await resolveAppUrl();
  if (!process.env.UNIPILE_DSN) throw new Error("UNIPILE_DSN is not configured");

  // `name` is echoed back on the notify webhook so we can correlate which
  // CRM user + company initiated the connection.
  const correlation = `${companyId}::${user.id}`;

  const provider = (opts?.provider ?? "gmail").toUpperCase() as "GMAIL" | "OUTLOOK" | "IMAP";
  const providers = provider === "IMAP" ? "MAIL" : provider === "GMAIL" ? "GOOGLE" : "OUTLOOK";

  const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const res = await createHostedAuthLink({
    type: "create",
    providers,
    api_url: process.env.UNIPILE_DSN!,
    expiresOn,
    notify_url: `${base}/api/unipile/webhook`,
    name: correlation,
    success_redirect_url: `${base}/settings/email?connected=1`,
    failure_redirect_url: `${base}/settings/email?error=auth_failed`,
  });

  return { url: res.url };
}

/**
 * Fallback: poll Unipile for the connected account and upsert locally.
 * The webhook is the fast path; this is used by the success redirect.
 */
export async function reconcileRecentAccounts(): Promise<number> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const companyId = await getActiveCompanyId();

  const { listAccounts: listUnipile } = await import("@/lib/unipile/client");
  const remote = await listUnipile();

  // Only accounts whose `name` correlation matches this user+company
  const correlation = `${companyId}::${user.id}`;
  const mine = remote.filter((a) => a.name === correlation);

  let added = 0;
  for (const acc of mine) {
    const email = extractEmail(acc);
    if (!email) continue;

    const { data: existing } = await sb
      .from("email_accounts")
      .select("id")
      .eq("unipile_account_id", acc.id)
      .maybeSingle();

    if (existing) continue;

    const { data: inserted, error } = await sb
      .from("email_accounts")
      .insert({
        company_id: companyId,
        user_id: user.id,
        provider: providerFromUnipileType(acc.type),
        email_address: email,
        unipile_account_id: acc.id,
        status: "connected",
        sync_state: "backfilling",
      })
      .select("id")
      .single();

    if (error || !inserted) continue;
    added++;

    // Fire-and-forget backfill
    backfillAccount(inserted.id as string).catch((err) => {
      console.error("[unipile] backfill failed", err);
    });
  }

  revalidatePath("/settings/email");
  return added;
}

/**
 * Manual connect: the user pastes a Unipile account ID (from the Unipile
 * dashboard or hosted-auth redirect). We fetch the account from Unipile,
 * store it locally, and kick off backfill.
 */
export async function connectAccountById(
  rawAccountId: string,
): Promise<{ ok: true; id: string; email: string } | { ok: false; error: string }> {
  const accountId = rawAccountId.trim();
  if (!accountId) return { ok: false, error: "Account ID is required" };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const companyId = await getActiveCompanyId();
  if (!companyId) return { ok: false, error: "No active company" };

  // Fetch from Unipile
  let acc;
  try {
    acc = await getAccount(accountId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch account";
    return { ok: false, error: msg };
  }

  const email = extractEmail(acc);
  if (!email) {
    return {
      ok: false,
      error: "Could not determine email address for this account from Unipile",
    };
  }

  // Already linked?
  const { data: existing } = await sb
    .from("email_accounts")
    .select("id, company_id")
    .eq("unipile_account_id", accountId)
    .maybeSingle();

  if (existing) {
    if (existing.company_id !== companyId) {
      return { ok: false, error: "This account is already linked to another workspace" };
    }
    // Re-enable if it was disconnected
    await sb
      .from("email_accounts")
      .update({ status: "connected", sync_state: "backfilling", sync_progress: 0, sync_error: null })
      .eq("id", existing.id as string);
    backfillAccount(existing.id as string).catch((err) =>
      console.error("[unipile] backfill failed", err),
    );
    revalidatePath("/settings/email");
    return { ok: true, id: existing.id as string, email };
  }

  const { data: inserted, error } = await sb
    .from("email_accounts")
    .insert({
      company_id: companyId,
      user_id: user.id,
      provider: providerFromUnipileType(acc.type),
      email_address: email,
      unipile_account_id: accountId,
      status: "connected",
      sync_state: "backfilling",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Failed to save account" };
  }

  backfillAccount(inserted.id as string).catch((err) =>
    console.error("[unipile] backfill failed", err),
  );
  revalidatePath("/settings/email");
  return { ok: true, id: inserted.id as string, email };
}

/**
 * Ping Unipile for the current status of a connected mailbox. Returns
 * `online: true` when at least one source reports status 'OK' (or no sources
 * array is returned, in which case Unipile treats the account as healthy).
 */
export async function pingAccount(
  accountRowId: string,
): Promise<{ online: boolean; status: string; error?: string }> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  if (!companyId) return { online: false, status: "no_company", error: "No active company" };

  const { data: row } = await sb
    .from("email_accounts")
    .select("id, unipile_account_id")
    .eq("id", accountRowId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!row) return { online: false, status: "missing", error: "Account not found" };

  try {
    const acc = await getAccount(row.unipile_account_id as string);
    const sources = acc.sources ?? [];
    const online =
      sources.length === 0 ? true : sources.some((s) => (s.status ?? "").toUpperCase() === "OK");
    const status = sources[0]?.status ?? "OK";

    // Mirror into our row so the UI can reflect it after a refresh.
    await sb
      .from("email_accounts")
      .update({
        status: online ? "connected" : "error",
        sync_error: online ? null : `Unipile status: ${status}`,
      })
      .eq("id", accountRowId);

    return { online, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ping failed";
    await sb
      .from("email_accounts")
      .update({ status: "error", sync_error: msg })
      .eq("id", accountRowId);
    return { online: false, status: "error", error: msg };
  }
}

export async function disconnectMailbox(accountId: string): Promise<void> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const { data: row } = await sb
    .from("email_accounts")
    .select("id, unipile_account_id")
    .eq("id", accountId)
    .eq("company_id", companyId)
    .single();

  if (!row) throw new Error("Account not found");

  // Best-effort Unipile teardown
  try {
    await getAccount(row.unipile_account_id as string);
    await deleteUnipileAccount(row.unipile_account_id as string);
  } catch (err) {
    console.error("[unipile] delete account", err);
  }

  await sb.from("email_accounts").update({ status: "disconnected" }).eq("id", accountId);
  revalidatePath("/settings/email");
}

function extractEmail(acc: { connection_params?: Record<string, unknown> | null; name?: string }): string | null {
  const cp = (acc.connection_params ?? {}) as Record<string, unknown>;

  // connection_params.mail / email / email_address can be either a bare string
  // OR a nested object like { address: "foo@bar" } or { identifier: "foo@bar" }
  // depending on the provider. Walk a few shapes defensively.
  const asString = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["address", "identifier", "email", "mail", "value"]) {
        const inner = o[k];
        if (typeof inner === "string") return inner;
      }
    }
    return null;
  };

  const candidates: unknown[] = [cp.mail, cp.email, cp.email_address, cp.username, cp.login];
  for (const c of candidates) {
    const s = asString(c);
    if (s && s.includes("@")) return s.toLowerCase();
  }

  // Last resort: some providers put the email in the top-level `name` when the
  // correlation token isn't used.
  if (typeof acc.name === "string" && acc.name.includes("@")) return acc.name.toLowerCase();

  return null;
}

/**
 * Prefer NEXT_PUBLIC_APP_URL; fall back to VERCEL_URL or the current request
 * host so the flow works even if the env var wasn't set explicitly.
 */
async function resolveAppUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;

  throw new Error("Could not determine app URL");
}
