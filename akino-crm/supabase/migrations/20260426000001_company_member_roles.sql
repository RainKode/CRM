-- =====================================================================
-- Migration: Reintroduce company member roles (manager | executive)
--
-- Context: migration 20260420000013_remove_roles.sql removed the
-- previous role system because the app had no use for it. This migration
-- reintroduces a deliberately small role hierarchy to support the
-- collaborative-pipelines feature: managers can assign batches/deals,
-- view team analytics, and manage members; executives work assignments.
--
-- Authorization remains app-side. RLS policies are NOT changed here:
-- both roles still pass `is_member_of_company`. Role enforcement happens
-- inside server actions via `is_company_manager()`.
-- =====================================================================

-- 1. Enum
do $$ begin
  create type company_member_role as enum ('manager', 'executive');
exception when duplicate_object then null; end $$;

-- 2. Column on company_members (default executive, every existing row gets it)
alter table company_members
  add column if not exists role company_member_role not null default 'executive';

-- 3. Backfill: each company's creator (if still a member) becomes the manager
update company_members cm
   set role = 'manager'
  from companies c
 where c.id = cm.company_id
   and c.created_by is not null
   and c.created_by = cm.user_id;

-- 4. Helper used by server actions to gate manager-only operations.
create or replace function public.is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from company_members
     where company_id = p_company_id
       and user_id = auth.uid()
       and role = 'manager'
  );
$$;

grant execute on function public.is_company_manager(uuid) to authenticated;

-- 5. Index to make the check fast
create index if not exists idx_company_members_user_role
  on company_members(user_id, company_id, role);
