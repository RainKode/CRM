import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export class RoleError extends Error {
  constructor(message = "Manager role required") {
    super(message);
    this.name = "RoleError";
  }
}

/**
 * Throws RoleError if the current authenticated user is not a manager
 * of the given company. Uses the SECURITY DEFINER `is_company_manager`
 * RPC defined in migration 20260426000001.
 *
 * This is the single source of truth for manager-only gating in server
 * actions. It is intentionally NOT used inside RLS policies — those
 * remain flat (any company member). All authorization happens app-side.
 */
export async function requireManager(companyId: string): Promise<{ userId: string }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new RoleError("Not authenticated");

  const { data, error } = await sb.rpc("is_company_manager", {
    p_company_id: companyId,
  });
  if (error) throw error;
  if (!data) throw new RoleError("Manager role required");
  return { userId: user.id };
}

/**
 * Non-throwing variant. Returns true if the current user is a manager
 * of the given company, false otherwise. Useful for conditional UI
 * rendering on the server (e.g., showing/hiding the "Manage members"
 * button on /team).
 */
export async function isManager(
  companyId: string,
  client?: SupabaseClient
): Promise<boolean> {
  const sb = client ?? (await createClient());
  const { data, error } = await sb.rpc("is_company_manager", {
    p_company_id: companyId,
  });
  if (error) return false;
  return Boolean(data);
}
