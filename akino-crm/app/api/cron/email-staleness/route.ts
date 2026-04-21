import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/unipile/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Nightly: mark deals whose last outbound was >14 days ago and no inbound
 * reply has arrived as `email_status = 'stale'` so they show up in the
 * follow-up queue with a nudge badge.
 */
export async function GET(req: NextRequest) {
  const unauth = authorizeCron(req);
  if (unauth) return unauth;

  const sb = createAdminClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Mark stale
  const { data: staled, error: e1 } = await sb
    .from("deals")
    .update({ email_status: "stale" })
    .in("email_status", ["awaiting_reply", "no_contact"])
    .lt("last_outbound_at", fourteenDaysAgo)
    .select("id");

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // Refresh template stats
  try {
    await sb.rpc("refresh_email_template_stats" as never);
  } catch {
    // view may not exist yet in some envs; ignore
  }

  const processed = staled?.length ?? 0;
  await sb.from("email_cron_runs").insert({
    job_name: "email-staleness",
    processed,
    failed: 0,
    note: `${processed} deals marked stale`,
  });

  return NextResponse.json({ ok: true, staled: processed });
}

export const POST = GET;
