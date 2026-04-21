import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileView } from "./profile-view";

export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) redirect("/login");

  return (
    <ProfileView
      email={user.email ?? ""}
      fullName={(user.user_metadata?.full_name as string) ?? ""}
    />
  );
}


