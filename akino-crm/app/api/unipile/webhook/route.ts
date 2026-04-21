import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/unipile/webhook";
import { getAccount, getMail, providerFromUnipileType } from "@/lib/unipile/client";
import { ingestUnipileMail, type StoredAccountRow } from "@/lib/unipile/ingest";
import { backfillAccount } from "@/lib/unipile/backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Unipile webhook dispatcher. One endpoint, many event types.
 *
 * Events handled in Milestone A:
 *   - account.created / account.connected  → upsert email_accounts, kick backfill
 *   - account.disconnected                 → flip status
 *   - mail.received / mail.sent / mail.new → fetch + ingest the message
 *
 * Idempotent: re-delivery of the same event is safe thanks to unique index
 * on email_messages.unipile_message_id.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const verdict = verifyWebhook(raw, req.headers);
  if (!verdict.ok) {
    console.warn("[unipile-webhook] rejected", verdict.reason);
    return NextResponse.json({ ok: false, error: verdict.reason }, { status: 401 });
  }

  let evt: WebhookEvent;
  try {
    evt = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = (evt.event ?? evt.type ?? "").toLowerCase();
  const sb = createAdminClient();

  try {
    if (eventType.startsWith("account.")) {
      await handleAccountEvent(sb, eventType, evt);
    } else if (eventType.startsWith("mail.") || eventType === "message") {
      await handleMailEvent(sb, eventType, evt);
    } else {
      console.log("[unipile-webhook] ignored event", eventType);
    }
  } catch (err) {
    console.error("[unipile-webhook] handler error", eventType, err);
    // Return 200 so Unipile doesn't retry-loop on our bug; we log for triage.
  }

  return NextResponse.json({ ok: true });
}

// -------------------------------------------------------------------------

type WebhookEvent = {
  event?: string;
  type?: string;
  account_id?: string;
  name?: string;          // the correlation we passed in hosted-auth (company::user)
  message_id?: string;    // for mail events
  email_id?: string;      // alt spelling
  data?: Record<string, unknown>;
};

async function handleAccountEvent(
  sb: ReturnType<typeof createAdminClient>,
  eventType: string,
  evt: WebhookEvent,
): Promise<void> {
  const unipileId = evt.account_id ?? (evt.data?.account_id as string | undefined);
  if (!unipileId) return;

  if (eventType === "account.disconnected" || eventType === "account.error") {
    await sb
      .from("email_accounts")
      .update({ status: "disconnected" })
      .eq("unipile_account_id", unipileId);
    return;
  }

  // Created / connected → fetch detail and upsert
  const correlation = evt.name ?? (evt.data?.name as string | undefined);
  if (!correlation || !correlation.includes("::")) {
    console.warn("[unipile-webhook] account event without correlation", unipileId);
    return;
  }
  const [companyId, userId] = correlation.split("::");

  const detail = await getAccount(unipileId);
  const email =
    (detail.connection_params?.mail as string | undefined) ??
    (detail.connection_params?.email as string | undefined) ??
    (detail.connection_params?.email_address as string | undefined) ??
    null;

  if (!email) {
    console.warn("[unipile-webhook] no email on account", unipileId);
    return;
  }

  const { data: existing } = await sb
    .from("email_accounts")
    .select("id")
    .eq("unipile_account_id", unipileId)
    .maybeSingle();

  let id: string;
  if (existing) {
    id = existing.id as string;
    await sb
      .from("email_accounts")
      .update({ status: "connected", sync_state: "backfilling" })
      .eq("id", id);
  } else {
    const { data: inserted, error } = await sb
      .from("email_accounts")
      .insert({
        company_id: companyId,
        user_id: userId,
        provider: providerFromUnipileType(detail.type),
        email_address: email.toLowerCase(),
        unipile_account_id: unipileId,
        status: "connected",
        sync_state: "backfilling",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[unipile-webhook] insert account failed", error);
      return;
    }
    id = inserted.id as string;
  }

  backfillAccount(id).catch((e) => console.error("[backfill]", e));
}

async function handleMailEvent(
  sb: ReturnType<typeof createAdminClient>,
  _eventType: string,
  evt: WebhookEvent,
): Promise<void> {
  const mailId =
    evt.message_id ??
    evt.email_id ??
    (evt.data?.message_id as string | undefined) ??
    (evt.data?.email_id as string | undefined) ??
    (evt.data?.id as string | undefined);
  const unipileAccountId =
    evt.account_id ?? (evt.data?.account_id as string | undefined);
  if (!mailId || !unipileAccountId) return;

  const { data: acct } = await sb
    .from("email_accounts")
    .select("id, company_id, user_id, email_address, unipile_account_id")
    .eq("unipile_account_id", unipileAccountId)
    .maybeSingle();

  if (!acct) {
    console.warn("[unipile-webhook] mail event for unknown account", unipileAccountId);
    return;
  }

  const mail = await getMail(mailId);
  await ingestUnipileMail(sb, acct as StoredAccountRow, mail);

  await sb
    .from("email_accounts")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", (acct as { id: string }).id);
}
