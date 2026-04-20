// Backfill: create deals for already-enriched leads + fix lead columns
import { createClient } from "@supabase/supabase-js";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function pick(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const val = data[k] ?? data[k.toLowerCase()] ?? data[k.charAt(0).toUpperCase() + k.slice(1)];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

async function main() {
  // Get all enriched leads
  const { data: leads } = await s
    .from("leads")
    .select("id, name, company, email, data, folder_id, status")
    .eq("status", "enriched");

  if (!leads || leads.length === 0) {
    console.log("No enriched leads found.");
    return;
  }

  console.log(`Found ${leads.length} enriched leads`);

  for (const lead of leads) {
    const data = (lead.data ?? {}) as Record<string, unknown>;
    const email = pick(data, "email", "Email") ?? lead.email;
    const company = pick(data, "company", "Company", "company_name") ?? lead.company;
    const phone = pick(data, "phone", "Phone");
    const website = pick(data, "website", "Website");
    const linkedin = pick(data, "linkedin_url", "LinkedIn", "linkedin");
    const decisionMaker = pick(data, "decision_maker", "Decision Maker", "contact_person");

    // Fix lead top-level columns
    await s.from("leads").update({ email, company }).eq("id", lead.id);
    console.log(`  Updated lead columns: ${lead.name} → email=${email}, company=${company}`);

    // Find batch for this lead
    const { data: batchLead } = await s
      .from("batch_leads")
      .select("batch_id")
      .eq("lead_id", lead.id)
      .eq("is_completed", true)
      .limit(1)
      .single();

    if (!batchLead) {
      console.log(`  No completed batch_lead for ${lead.name}, skipping deal creation`);
      continue;
    }

    // Find pipeline for this batch
    const { data: pipeline } = await s
      .from("pipelines")
      .select("id")
      .eq("batch_id", batchLead.batch_id)
      .eq("is_archived", false)
      .single();

    if (!pipeline) {
      console.log(`  No pipeline for batch ${batchLead.batch_id}, skipping`);
      continue;
    }

    // Get first stage
    const { data: firstStage } = await s
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("is_archived", false)
      .order("position", { ascending: true })
      .limit(1)
      .single();

    if (!firstStage) {
      console.log(`  No stages for pipeline ${pipeline.id}, skipping`);
      continue;
    }

    // Check existing deal
    const { count } = await s
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id);

    if ((count ?? 0) > 0) {
      console.log(`  Deal already exists for ${lead.name}, skipping`);
      continue;
    }

    // Create deal
    const { error } = await s.from("deals").insert({
      lead_id: lead.id,
      source_folder_id: lead.folder_id,
      stage_id: firstStage.id,
      contact_name: lead.name || email || "Unknown",
      company,
      email,
      phone,
      linkedin_url: linkedin,
      website,
      decision_maker: decisionMaker,
    });

    if (error) {
      console.log(`  FAIL deal for ${lead.name}: ${error.message}`);
    } else {
      console.log(`  Created deal for: ${lead.name}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
