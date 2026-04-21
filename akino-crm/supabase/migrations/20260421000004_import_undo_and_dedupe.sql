-- ==========================================================
-- Slice 5 — Import Safety + Data Hygiene
--   1. Tag each imported lead with the import_history row it came from
--      so we can offer a 24h "Undo last import" that deletes only those
--      leads, never touching anything else in the folder.
--   2. Let each folder configure which lead fields constitute a "duplicate"
--      on future imports (defaults to email-only, matching today's behaviour).
--   3. Persist what the preview dry-run calculated alongside the history row
--      so the UI can show "3 new, 12 updated, 2 skipped" after the fact.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. leads.import_batch_id
-- ----------------------------------------------------------
alter table leads
  add column if not exists import_batch_id uuid
    references import_history(id) on delete set null;

create index if not exists idx_leads_import_batch
  on leads(import_batch_id)
  where import_batch_id is not null;

-- ----------------------------------------------------------
-- 2. folders.dedupe_keys
--    Array of match strategies evaluated in order. Supported values:
--      'email'        — case-insensitive email match (current default)
--      'phone'        — normalised digits-only phone match
--      'name_company' — case-insensitive name + company match
-- ----------------------------------------------------------
alter table folders
  add column if not exists dedupe_keys text[]
    not null default array['email']::text[];

alter table folders
  add constraint folders_dedupe_keys_valid
  check (
    dedupe_keys <@ array['email','phone','name_company']::text[]
    and array_length(dedupe_keys, 1) is not null
  );

-- ----------------------------------------------------------
-- 3. import_history extras for undo + preview
-- ----------------------------------------------------------
alter table import_history
  add column if not exists updated_rows integer not null default 0,
  add column if not exists new_rows integer not null default 0,
  add column if not exists undone_at timestamptz,
  add column if not exists dedupe_keys text[]
    not null default array['email']::text[];

-- Rename index on import_history is unnecessary; the existing
-- idx_import_history_folder(folder_id, created_at desc) covers the
-- "latest undoable import per folder" query.
