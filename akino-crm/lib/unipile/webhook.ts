import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify an incoming Unipile webhook.
 *
 * Unipile webhooks can be delivered with a shared secret header. To keep our
 * surface provider-agnostic we sign with HMAC-SHA256 over the raw body using
 * UNIPILE_WEBHOOK_SECRET. Unipile supports a custom header per environment.
 *
 * Header contract we use:
 *   X-Webhook-Secret: <UNIPILE_WEBHOOK_SECRET>            (simple shared secret)
 *   X-Webhook-Signature: sha256=<hex(HMAC(body, secret))> (preferred)
 *
 * Either presented value must match. Rejects if neither env is set.
 */
export function verifyWebhook(
  rawBody: string,
  headers: Headers,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, reason: "UNIPILE_WEBHOOK_SECRET not configured" };
  }

  const sharedHeader = headers.get("x-webhook-secret");
  if (sharedHeader && safeEq(sharedHeader, secret)) return { ok: true };

  const sigHeader = headers.get("x-webhook-signature");
  if (sigHeader) {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    if (safeEq(sigHeader, expected)) return { ok: true };
  }

  return { ok: false, reason: "Signature mismatch" };
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
