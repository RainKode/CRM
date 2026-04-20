import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Check enriched leads
  const { data: leads } = await s.from("leads").select("id, name, company, email, status, data").eq("status", "enriched");
  console.log("=== ENRICHED LEADS ===");
  for (const l of leads ?? []) {
    console.log(JSON.stringify({ id: l.id, name: l.name, company: l.company, email: l.email, data: l.data }, null, 2));
  }

  // Check deals
  const { data: deals } = await s.from("deals").select("*");
  console.log("\n=== DEALS ===");
  console.log(`Total deals: ${(deals ?? []).length}`);
  for (const d of deals ?? []) {
    console.log(JSON.stringify({ id: d.id, contact_name: d.contact_name, company: d.company, email: d.email, lead_id: d.lead_id, stage_id: d.stage_id }, null, 2));
  }

  // Check batch_leads for these enriched leads
  if (leads && leads.length > 0) {
    const leadIds = leads.map(l => l.id);
    const { data: batchLeads } = await s.from("batch_leads").select("batch_id, lead_id, is_completed").in("lead_id", leadIds);
    console.log("\n=== BATCH_LEADS for enriched ===");
    for (const bl of batchLeads ?? []) {
      console.log(JSON.stringify(bl));
    }
  }
}
main().catch(console.error);
