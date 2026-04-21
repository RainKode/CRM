-- ==========================================================
-- Repair migration — previous 20260421000004 was marked applied but
-- its DDL never landed on remote (observed: import_history.dedupe_keys
-- and leads.import_batch_id missing in prod). Re-apply idempotently.
-- ==========================================================

-- leads.import_batch_id
alter table leads
  add column if not exists import_batch_id uuid
    references import_history(id) on delete set null;

create index if not exists idx_leads_import_batch
  on leads(import_batch_id)
  where import_batch_id is not null;

-- folders.dedupe_keys
alter table folders
  add column if not exists dedupe_keys text[]
    not null default array['email']::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'folders_dedupe_keys_valid'
  ) then
    alter table folders
      add constraint folders_dedupe_keys_valid
      check (
        dedupe_keys <@ array['email','phone','name_company']::text[]
        and array_length(dedupe_keys, 1) is not null
      );
  end if;
end$$;

-- import_history extras
alter table import_history
  add column if not exists updated_rows integer not null default 0,
  add column if not exists new_rows integer not null default 0,
  add column if not exists undone_at timestamptz,
  add column if not exists dedupe_keys text[]
    not null default array['email']::text[];

-- Force PostgREST schema cache reload
notify pgrst, 'reload schema';
