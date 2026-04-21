-- ==========================================================
-- Saved Views: reusable filter/sort snapshots for pipeline + folders
-- ==========================================================

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  scope text not null check (scope in ('pipeline', 'folder')),
  scope_ref uuid,                 -- pipeline_id or folder_id; null = global within scope
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_views_company on saved_views(company_id);
create index if not exists idx_saved_views_scope
  on saved_views(company_id, scope, scope_ref);
create index if not exists idx_saved_views_owner on saved_views(owner_id);

-- Touch trigger (reuse existing helper if present; otherwise inline)
create or replace function touch_saved_views_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_saved_views_updated_at on saved_views;
create trigger trg_touch_saved_views_updated_at
  before update on saved_views
  for each row execute function touch_saved_views_updated_at();

-- RLS: view is visible if company member AND (owner OR is_shared).
--      view is writable only by its owner.
alter table saved_views enable row level security;

drop policy if exists saved_views_select on saved_views;
create policy saved_views_select on saved_views for select
  using (
    public.is_member_of_company(company_id)
    and (owner_id = auth.uid() or is_shared)
  );

drop policy if exists saved_views_insert on saved_views;
create policy saved_views_insert on saved_views for insert
  with check (
    public.is_member_of_company(company_id)
    and owner_id = auth.uid()
  );

drop policy if exists saved_views_update on saved_views;
create policy saved_views_update on saved_views for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists saved_views_delete on saved_views;
create policy saved_views_delete on saved_views for delete
  using (owner_id = auth.uid());
