/**
 * Cron: flush scheduled email sends that are due.
 * Vercel cron hits this every 5 min. Also gated by CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/unipile/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode — allow
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const sb = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";

  const now = new Date().toISOString();
  const { data: due, error } = await sb
    .from("email_messages")
    .select(
      `id, thread_id, company_id, subject, body_html, to_addresses,
       cc_addresses, bcc_addresses, sent_from_account_id, scheduled_send_at,
       email_accounts:sent_from_account_id ( id, unipile_account_id )`,
    )
    .eq("status", "scheduled")
    .lte("scheduled_send_at", now)
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sent = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const msg of due ?? []) {
    try {
      const acct = Array.isArray(
        (msg as { email_accounts?: { unipile_account_id: string } | { unipile_account_id: string }[] })
          .email_accounts,
      )
        ? (msg as { email_accounts: { unipile_account_id: string }[] }).email_accounts[0]
        : (msg as { email_accounts?: { unipile_account_id: string } }).email_accounts;

      if (!acct?.unipile_account_id) {
        throw new Error("Sending account missing unipile_account_id");
      }

      // Inject tracking now (messageId is stable)
      let wireHtml = (msg.body_html as string) ?? "";
      if (baseUrl) {
        wireHtml = rewriteLinks(wireHtml, msg.id as string, baseUrl);
        wireHtml += `<img src="${baseUrl}/api/t/open/${msg.id}" width="1" height="1" style="display:none" alt="" />`;
      }

      const result = await sendMail({
        account_id: acct.unipile_account_id,
        to: ((msg.to_addresses as string[]) ?? []).map((e) => ({ identifier: e })),
        cc: ((msg.cc_addresses as string[]) ?? []).map((e) => ({ identifier: e })),
        bcc: ((msg.bcc_addresses as string[]) ?? []).map((e) => ({ identifier: e })),
        subject: (msg.subject as string) ?? "",
        body: wireHtml,
        tracking_options: { opens: true, links: true },
      });

      await sb
        .from("email_messages")
        .update({
          status: "sent",
          unipile_message_id: result.id,
          message_id_header: result.provider_id ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id as string);

      sent++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "send failed";
      errors.push({ id: msg.id as string, error: errMsg });
      await sb
        .from("email_messages")
        .update({ status: "failed", send_error: errMsg })
        .eq("id", msg.id as string);
    }
  }

  return NextResponse.json({ ok: true, processed: due?.length ?? 0, sent, errors });
}

function rewriteLinks(html: string, messageId: string, base: string): string {
  return html.replace(
    /href\s*=\s*("|')(https?:\/\/[^"']+)("|')/gi,
    (_m, q1, url) => {
      if (url.startsWith(`${base}/api/t/`)) return `href=${q1}${url}${q1}`;
      const enc = Buffer.from(url, "utf8").toString("base64url");
      return `href=${q1}${base}/api/t/click/${messageId}?u=${enc}${q1}`;
    },
  );
}
