import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  // Record the event best-effort — never let tracking break image delivery
  try {
    const sb = createAdminClient();
    const ua = req.headers.get("user-agent") ?? null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // Insert the raw event
    await sb.from("email_tracking_events").insert({
      message_id: messageId,
      event: "open",
      user_agent: ua,
      ip,
    });

    // Bump counters on the message (first open gets a timestamp)
    const { data: existing } = await sb
      .from("email_messages")
      .select("opens, first_opened_at")
      .eq("id", messageId)
      .maybeSingle();

    if (existing) {
      await sb
        .from("email_messages")
        .update({
          opens: (existing.opens ?? 0) + 1,
          first_opened_at:
            existing.first_opened_at ?? new Date().toISOString(),
        })
        .eq("id", messageId);
    }
  } catch (err) {
    console.error("[tracking] open", err);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": PIXEL.length.toString(),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
