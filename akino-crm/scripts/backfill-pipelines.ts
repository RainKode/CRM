// Backfill script: create pipelines for existing batches
// Run with: npx tsx --env-file=.env.local scripts/backfill-pipelines.ts

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const DEFAULT_PIPELINE_ID = "7e31e2cb-a55a-4015-a7ec-a2d7680337c5";

async function main() {
  // 0. Clean up any orphaned pipelines from previous failed attempt
  const { data: orphans } = await supabase
    .from("pipelines")
    .select("id")
    .not("batch_id", "is", null);
  if (orphans && orphans.length > 0) {
    const orphanIds = orphans.map((p) => p.id);
    // Check which ones have no stages
    for (const pid of orphanIds) {
      const { count } = await supabase
        .from("pipeline_stages")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pid);
      if (count === 0) {
        await supabase.from("pipelines").delete().eq("id", pid);
        console.log(`  Cleaned up orphaned pipeline ${pid}`);
      }
    }
  }

  // 1. Get all batches
  const { data: batches, error: bErr } = await supabase
    .from("batches")
    .select("id, name, folder_id")
    .order("created_at");
  if (bErr) throw bErr;
  console.log(`Found ${batches.length} batches`);

  // 2. Check which batches already have a pipeline
  const { data: existing } = await supabase
    .from("pipelines")
    .select("batch_id")
    .not("batch_id", "is", null);
  const existingBatchIds = new Set((existing ?? []).map((p) => p.batch_id));

  // 3. Get template stages from default pipeline
  const { data: templateStages, error: sErr } = await supabase
    .from("pipeline_stages")
    .select("name, position, is_won, is_lost")
    .eq("pipeline_id", DEFAULT_PIPELINE_ID)
    .eq("is_archived", false)
    .order("position");
  if (sErr) throw sErr;
  console.log(`Template has ${templateStages.length} stages`);

  // 4. Create pipeline + stages for each batch
  let created = 0;
  for (const batch of batches) {
    if (existingBatchIds.has(batch.id)) {
      console.log(`  Skip ${batch.name} (already has pipeline)`);
      continue;
    }

    const { data: pipeline, error: pErr } = await supabase
      .from("pipelines")
      .insert({
        name: batch.name,
        folder_id: batch.folder_id,
        batch_id: batch.id,
      })
      .select("id")
      .single();
    if (pErr) { console.error(`  FAIL ${batch.name}:`, pErr.message); continue; }

    const { error: stErr } = await supabase.from("pipeline_stages").insert(
      templateStages.map((s) => ({
        name: s.name,
        position: s.position,
        is_won: s.is_won,
        is_lost: s.is_lost,
        pipeline_id: pipeline.id,
      }))
    );
    if (stErr) { console.error(`  FAIL stages for ${batch.name}:`, stErr.message); continue; }

    console.log(`  Created pipeline for: ${batch.name}`);
    created++;
  }

  console.log(`\nDone. Created ${created} pipelines.`);
}

main().catch(console.error);
