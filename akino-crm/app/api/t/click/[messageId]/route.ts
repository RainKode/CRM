import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const url = new URL(req.url);
  const encoded = url.searchParams.get("u");

  // Decode the destination URL — fall back to home if missing/garbage
  let target = "/";
  if (encoded) {
    try {
      target = Buffer.from(encoded, "base64url").toString("utf8");
      // Guard: must be http(s)
      if (!/^https?:\/\//i.test(target)) target = "/";
    } catch {
      target = "/";
    }
  }

  // Record the click best-effort
  try {
    const sb = createAdminClient();
    const ua = req.headers.get("user-agent") ?? null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    await sb.from("email_tracking_events").insert({
      message_id: messageId,
      event: "click",
      url: target,
      user_agent: ua,
      ip,
    });

    const { data: existing } = await sb
      .from("email_messages")
      .select("clicks, first_clicked_at")
      .eq("id", messageId)
      .maybeSingle();

    if (existing) {
      await sb
        .from("email_messages")
        .update({
          clicks: (existing.clicks ?? 0) + 1,
          first_clicked_at:
            existing.first_clicked_at ?? new Date().toISOString(),
        })
        .eq("id", messageId);
    }
  } catch (err) {
    console.error("[tracking] click", err);
  }

  return NextResponse.redirect(target, { status: 302 });
}
