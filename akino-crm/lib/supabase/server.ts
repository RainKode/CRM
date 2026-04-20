import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            // Can be ignored in Server Components — refresh handled in middleware
          }
        },
      },
    }
  );
}

/**
 * Read the active company ID from the cookie.
 * Falls back to the user's default company if no cookie is set.
 */
export async function getActiveCompanyId(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("active_company_id")?.value;
  if (fromCookie) return fromCookie;

  // Fallback: look up user's default company
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (membership) return membership.company_id;

  // Last resort: any company the user belongs to
  const { data: anyMembership } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (anyMembership) return anyMembership.company_id;

  throw new Error("User is not a member of any company");
}
