import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "./actions";
import { TemplatesView } from "./templates-view";

export default async function TemplatesSettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const templates = await listTemplates();
  return <TemplatesView initialTemplates={templates} />;
}
