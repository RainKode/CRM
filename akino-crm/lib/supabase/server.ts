import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient(
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
 * Returns null if the user has no company memberships.
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

  if (membership) {
    // Set cookie for future requests
    try { cookieStore.set("active_company_id", membership.company_id, { path: "/", maxAge: 60 * 60 * 24 * 365 }); } catch {}
    return membership.company_id;
  }

  // Last resort: any company the user belongs to
  const { data: anyMembership } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (anyMembership) {
    try { cookieStore.set("active_company_id", anyMembership.company_id, { path: "/", maxAge: 60 * 60 * 24 * 365 }); } catch {}
    return anyMembership.company_id;
  }

  throw new Error("User is not a member of any company");
}
