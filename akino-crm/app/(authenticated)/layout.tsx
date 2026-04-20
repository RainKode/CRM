import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NoCompanyScreen } from "./no-company-screen";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/login");

  // Check if user belongs to any company
  const { data: membership } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return <NoCompanyScreen email={user.email ?? ""} />;
  }

  return <AppShell>{children}</AppShell>;
}
