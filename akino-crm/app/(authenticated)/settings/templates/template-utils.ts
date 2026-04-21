/**
 * Pure helpers for email template placeholder substitution. Shared between
 * server actions and client components, so it must not be marked `"use server"`.
 */

/** Replace every `{{key}}` in `str` with `ctx[key]`, leaving unknown keys untouched. */
export function applyTemplate(str: string, ctx: Record<string, string>): string {
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    return v == null ? `{{${key}}}` : v;
  });
}

/** Same extractor as the server action — kept here so clients can preview usage. */
export function extractVariables(...parts: string[]): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const p of parts) {
    if (!p) continue;
    for (const m of p.matchAll(re)) found.add(m[1]);
  }
  return Array.from(found).sort();
}

export const TEMPLATE_VARIABLE_HINTS = [
  { key: "first_name", help: "Lead first name" },
  { key: "last_name", help: "Lead last name" },
  { key: "full_name", help: "Lead full name" },
  { key: "company", help: "Lead company" },
  { key: "email", help: "Lead email" },
  { key: "deal_value", help: "Deal value (formatted)" },
  { key: "my_name", help: "Your name" },
  { key: "my_email", help: "Your email" },
] as const;
