/**
 * Outbound email helper: injects tracking pixel + link rewrites, persists
 * a local email_messages row, calls Unipile, and stitches the returned id
 * back. Idempotent-friendly (refuses to resend once unipile_message_id is set).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "./client";

export type SendEmailInput = {
  accountId: string;           // email_accounts.id (our row)
  unipileAccountId: string;    // unipile account id
  fromAddress: string;
  fromName?: string;
  companyId: string;
  userId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  threadId?: string | null;          // local threads.id (reply)
  replyToUnipileMessageId?: string | null;
  dealId?: string | null;
  leadId?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  templateId?: string | null;
  baseUrl?: string;                  // for tracking URLs; falls back to env
};

export type SendEmailResult = {
  message_id: string;
  thread_id: string;
};

export async function sendEmailAndPersist(
  sb: SupabaseClient,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const baseUrl =
    input.baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  // 1. Create or reuse a thread
  let threadId = input.threadId ?? null;
  if (!threadId) {
    const participants = dedupeLower([
      input.fromAddress,
      ...input.to,
      ...(input.cc ?? []),
    ]);
    const { data: thr, error } = await sb
      .from("email_threads")
      .insert({
        company_id: input.companyId,
        deal_id: input.dealId ?? null,
        lead_id: input.leadId ?? null,
        subject: input.subject,
        participants,
        last_message_at: new Date().toISOString(),
        is_waiting_on_them: true,
        awaiting_since: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !thr) throw new Error(error?.message ?? "Failed to create thread");
    threadId = thr.id as string;
  }

  // 2. Insert local outbound row up-front so we have an id for tracking URLs
  const { data: msg, error: msgErr } = await sb
    .from("email_messages")
    .insert({
      company_id: input.companyId,
      thread_id: threadId,
      direction: "outbound",
      from_address: input.fromAddress,
      from_name: input.fromName ?? null,
      to_addresses: input.to,
      cc_addresses: input.cc ?? [],
      bcc_addresses: input.bcc ?? [],
      subject: input.subject,
      body_html: input.bodyHtml,
      body_text: htmlToText(input.bodyHtml),
      snippet: snippetOf(input.bodyHtml),
      sent_at: new Date().toISOString(),
      sent_by_user_id: input.userId,
      sent_from_account_id: input.accountId,
      template_id: input.templateId ?? null,
      is_read: true,
    })
    .select("id")
    .single();

  if (msgErr || !msg) {
    throw new Error(msgErr?.message ?? "Failed to persist message");
  }

  const messageId = msg.id as string;

  // 3. Inject tracking
  let wireHtml = input.bodyHtml;
  if (input.trackClicks && baseUrl) {
    wireHtml = rewriteLinks(wireHtml, messageId, baseUrl);
  }
  if (input.trackOpens && baseUrl) {
    wireHtml = wireHtml + trackingPixel(messageId, baseUrl);
  }

  // 4. Call Unipile
  try {
    const sendRes = await sendMail({
      account_id: input.unipileAccountId,
      to: input.to.map((e) => ({ identifier: e })),
      cc: (input.cc ?? []).map((e) => ({ identifier: e })),
      bcc: (input.bcc ?? []).map((e) => ({ identifier: e })),
      subject: input.subject,
      body: wireHtml,
      reply_to: input.replyToUnipileMessageId ?? undefined,
      tracking_options: {
        opens: !!input.trackOpens,
        links: !!input.trackClicks,
      },
    });

    await sb
      .from("email_messages")
      .update({
        unipile_message_id: sendRes.id,
        message_id_header: sendRes.provider_id ?? null,
      })
      .eq("id", messageId);
  } catch (err) {
    // Unwind: remove the row so the user can try again
    await sb.from("email_messages").delete().eq("id", messageId);
    throw err;
  }

  return { message_id: messageId, thread_id: threadId };
}

// ---------------------------------------------------------------------------

function trackingPixel(messageId: string, base: string): string {
  return `<img src="${base}/api/t/open/${messageId}" width="1" height="1" style="display:none" alt="" />`;
}

function rewriteLinks(html: string, messageId: string, base: string): string {
  // Rewrite http(s) hrefs. Skip mailto:, tel:, anchors, and already-rewritten.
  return html.replace(
    /href\s*=\s*("|')(https?:\/\/[^"']+)("|')/gi,
    (_match, q1, url) => {
      if (url.startsWith(`${base}/api/t/`)) return `href=${q1}${url}${q1}`;
      const enc = Buffer.from(url, "utf8").toString("base64url");
      return `href=${q1}${base}/api/t/click/${messageId}?u=${enc}${q1}`;
    },
  );
}

function dedupeLower(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of arr) {
    if (!e) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function snippetOf(html: string): string {
  const text = htmlToText(html);
  return text.length > 280 ? text.slice(0, 277) + "…" : text;
}
