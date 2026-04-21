// Plain (non-"use server") module so we can export constants/types that
// are safe to import into both server and client components without
// tripping Next.js's server-action export rules.

export const BATCH_DELETE_PHRASE = "DELETE FOREVER";
