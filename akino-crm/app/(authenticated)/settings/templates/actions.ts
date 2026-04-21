"use server";

import { revalidatePath } from "next/cache";
import { createClient, getActiveCompanyId } from "@/lib/supabase/server";
import type { EmailTemplate } from "@/lib/types";

/**
 * Extract `{{variable}}` names from subject + body. Used to keep
 * `email_templates.variables` in sync with what the template actually uses
 * so the inserter can render a hint of which fields will be substituted.
 */
function extractVariables(...parts: string[]): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const p of parts) {
    if (!p) continue;
    for (const m of p.matchAll(re)) found.add(m[1]);
  }
  return Array.from(found).sort();
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { data, error } = await sb
    .from("email_templates")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

export async function createTemplate(input: {
  name: string;
  subject: string;
  body_html: string;
  is_shared?: boolean;
  folder_id?: string | null;
}): Promise<EmailTemplate> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const companyId = await getActiveCompanyId();

  const name = input.name.trim();
  const subject = input.subject.trim();
  const body_html = input.body_html;
  if (!name) throw new Error("Name is required");
  if (!subject) throw new Error("Subject is required");

  const { data, error } = await sb
    .from("email_templates")
    .insert({
      company_id: companyId,
      created_by: user.id,
      name,
      subject,
      body_html,
      variables: extractVariables(subject, body_html),
      is_shared: input.is_shared ?? true,
      folder_id: input.folder_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  revalidatePath("/settings/templates");
  return data as EmailTemplate;
}

export async function updateTemplate(
  id: string,
  input: {
    name?: string;
    subject?: string;
    body_html?: string;
    is_shared?: boolean;
    folder_id?: string | null;
  }
): Promise<EmailTemplate> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();

  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const n = input.name.trim();
    if (!n) throw new Error("Name is required");
    patch.name = n;
  }
  if (typeof input.subject === "string") {
    const s = input.subject.trim();
    if (!s) throw new Error("Subject is required");
    patch.subject = s;
  }
  if (typeof input.body_html === "string") patch.body_html = input.body_html;
  if (typeof input.is_shared === "boolean") patch.is_shared = input.is_shared;
  if ("folder_id" in input) patch.folder_id = input.folder_id ?? null;

  // Recompute variables if either content field is changing.
  if ("subject" in patch || "body_html" in patch) {
    // Need existing row to compose with whatever isn't being changed.
    const { data: existing, error: readErr } = await sb
      .from("email_templates")
      .select("subject, body_html")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (readErr) throw readErr;
    patch.variables = extractVariables(
      (patch.subject as string | undefined) ?? existing.subject,
      (patch.body_html as string | undefined) ?? existing.body_html,
    );
  }

  const { data, error } = await sb
    .from("email_templates")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw error;

  revalidatePath("/settings/templates");
  return data as EmailTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const sb = await createClient();
  const companyId = await getActiveCompanyId();
  const { error } = await sb
    .from("email_templates")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/settings/templates");
}

// ───────────────────────────────────────────────────────────────────
// Template insertion (used by QuickLogPopover on email activities)
// ───────────────────────────────────────────────────────────────────

export type TemplateContext = {
  first_name: string;
  last_name: string;
  full_name: string;
  company: string;
  email: string;
  deal_value: string;
  my_name: string;
  my_email: string;
};

/**
 * Collect the values used to substitute `{{mustache}}` placeholders when a
 * template is inserted against a deal. Pulls from the deal itself and the
 * linked lead, then falls back to the signed-in user for the `my_*` pair.
 */
export async function getTemplateContext(dealId: string): Promise<TemplateContext> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const { data: deal } = await sb
    .from("deals")
    .select(
      "contact_name, company, email, deal_value, currency, lead_id"
    )
    .eq("id", dealId)
    .maybeSingle();

  let leadName: string | null = null;
  let leadCompany: string | null = null;
  let leadEmail: string | null = null;
  if (deal?.lead_id) {
    const { data: lead } = await sb
      .from("leads")
      .select("name, company, email")
      .eq("id", deal.lead_id)
      .maybeSingle();
    leadName = (lead?.name as string | null) ?? null;
    leadCompany = (lead?.company as string | null) ?? null;
    leadEmail = (lead?.email as string | null) ?? null;
  }

  const fullName = (leadName ?? (deal?.contact_name as string | null) ?? "").trim();
  const [firstName = "", ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ");

  const dealValueNum = (deal?.deal_value as number | null) ?? null;
  const currency = (deal?.currency as string | null) ?? "USD";
  const dealValue = dealValueNum != null
    ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(dealValueNum)
    : "";

  const myName =
    ((user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email ?? "").trim();

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    company: leadCompany ?? (deal?.company as string | null) ?? "",
    email: leadEmail ?? (deal?.email as string | null) ?? "",
    deal_value: dealValue,
    my_name: myName,
    my_email: user?.email ?? "",
  };
}

