import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel cron requests come in with an `Authorization: Bearer <CRON_SECRET>`
 * header. We also allow an explicit `x-cron-secret` header for manual triggers.
 */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // If not configured we skip auth so local dev still works. Log once.
    return null;
  }
  const auth = req.headers.get("authorization") ?? "";
  const explicit = req.headers.get("x-cron-secret") ?? "";
  if (auth === `Bearer ${secret}` || explicit === secret) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
