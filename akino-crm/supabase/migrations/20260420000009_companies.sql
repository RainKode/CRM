-- =====================================================================
-- Migration: Add multi-company support
-- Creates companies + company_members tables, adds company_id to
-- folders, pipelines, deals, loss_reasons. Backfills existing data
-- into a default "Akino" company.
-- =====================================================================

-- 1. Companies table
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Company members junction
create table if not exists company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null default 'sales_rep',
  is_default boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists idx_company_members_user on company_members(user_id);

-- 3. Add company_id columns (nullable first for backfill)
alter table folders add column if not exists company_id uuid references companies(id) on delete cascade;
alter table pipelines add column if not exists company_id uuid references companies(id) on delete cascade;
alter table deals add column if not exists company_id uuid references companies(id) on delete cascade;
alter table loss_reasons add column if not exists company_id uuid references companies(id) on delete cascade;

-- 4. Backfill: create "Akino" company owned by the first admin user
do $$
declare
  akino_id uuid;
  first_user_id uuid;
begin
  -- Find first user
  select id into first_user_id from profiles order by created_at limit 1;

  -- Create Akino company
  insert into companies (name, created_by)
  values ('Akino', first_user_id)
  returning id into akino_id;

  -- Assign all existing data to Akino
  update folders set company_id = akino_id where company_id is null;
  update pipelines set company_id = akino_id where company_id is null;
  update deals set company_id = akino_id where company_id is null;
  update loss_reasons set company_id = akino_id where company_id is null;

  -- Add all existing users as members of Akino
  insert into company_members (company_id, user_id, role, is_default)
  select akino_id, id, role, true
  from profiles
  on conflict do nothing;
end $$;

-- 5. Now make company_id NOT NULL
alter table folders alter column company_id set not null;
alter table pipelines alter column company_id set not null;
alter table deals alter column company_id set not null;
-- loss_reasons stays nullable (shared ones have null company_id)

-- 6. Indexes
create index if not exists idx_folders_company on folders(company_id);
create index if not exists idx_pipelines_company on pipelines(company_id);
create index if not exists idx_deals_company on deals(company_id);
create index if not exists idx_loss_reasons_company on loss_reasons(company_id);

-- 7. RLS for new tables
alter table companies enable row level security;
alter table company_members enable row level security;

-- Companies: users can see companies they belong to
drop policy if exists companies_member_read on companies;
create policy companies_member_read on companies for select
  using (
    exists (
      select 1 from company_members
      where company_members.company_id = companies.id
        and company_members.user_id = auth.uid()
    )
  );

-- Companies: any active user can create a company
drop policy if exists companies_insert on companies;
create policy companies_insert on companies for insert
  with check (public.is_active_member());

-- Companies: company admins can update their company
drop policy if exists companies_update on companies;
create policy companies_update on companies for update
  using (
    exists (
      select 1 from company_members
      where company_members.company_id = companies.id
        and company_members.user_id = auth.uid()
        and company_members.role = 'admin'
    )
  );

-- Company members: users can see members of companies they belong to
drop policy if exists company_members_read on company_members;
create policy company_members_read on company_members for select
  using (
    exists (
      select 1 from company_members cm
      where cm.company_id = company_members.company_id
        and cm.user_id = auth.uid()
    )
  );

-- Company members: admins can manage members
drop policy if exists company_members_manage on company_members;
create policy company_members_manage on company_members for all
  using (
    exists (
      select 1 from company_members cm
      where cm.company_id = company_members.company_id
        and cm.user_id = auth.uid()
        and cm.role = 'admin'
    )
  );

-- Company members: users can update their own membership (e.g. is_default)
drop policy if exists company_members_self_update on company_members;
create policy company_members_self_update on company_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Company members: users can insert themselves (for creating companies)
drop policy if exists company_members_self_insert on company_members;
create policy company_members_self_insert on company_members for insert
  with check (user_id = auth.uid());

-- 8. Updated-at trigger for companies
drop trigger if exists trg_touch_companies on companies;
create trigger trg_touch_companies before update on companies
  for each row execute procedure public.touch_updated_at();
