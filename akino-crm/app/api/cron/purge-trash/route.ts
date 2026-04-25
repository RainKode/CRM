import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/unipile/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const unauth = authorizeCron(req);
  if (unauth) return unauth;

  const sb = createAdminClient();

  const { error } = await sb.rpc("purge_old_trash");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged_at: new Date().toISOString() });
}
