import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccounts, reconcileRecentAccounts } from "./actions";
import { EmailSettingsView } from "./email-settings-view";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  // If we just came back from hosted auth, try to reconcile in case the
  // webhook hasn't landed yet.
  if (sp.connected === "1") {
    try { await reconcileRecentAccounts(); } catch { /* non-fatal */ }
  }

  const accounts = await listAccounts();

  return (
    <EmailSettingsView
      accounts={accounts}
      justConnected={sp.connected === "1"}
      authError={sp.error ?? null}
    />
  );
}
