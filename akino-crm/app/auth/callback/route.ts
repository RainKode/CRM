import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const { url, key } = getSupabasePublicConfig();
    const supabase = createServerClient(
      url,
      key,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignored in Server Components
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Auto-add new users to all existing companies
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();

        // Check if user has any memberships already
        const { data: existing } = await admin
          .from("company_members")
          .select("company_id")
          .eq("user_id", user.id)
          .limit(1);

        if (!existing || existing.length === 0) {
          // New user — add to all companies
          const { data: companies } = await admin
            .from("companies")
            .select("id");
          if (companies && companies.length > 0) {
            const memberships = companies.map((c, i) => ({
              company_id: c.id,
              user_id: user.id,
              is_default: i === 0,
            }));
            await admin
              .from("company_members")
              .insert(memberships)
              .throwOnError();
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails, redirect to login with error
  return NextResponse.redirect(`${origin}/login`);
}
