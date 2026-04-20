-- =====================================================================
-- Migration: Remove all role-based access control
-- The app has no roles — every user can see/create/manage everything.
-- =====================================================================

-- 1. Drop the role column from company_members
alter table company_members drop column if exists role;

-- 2. Drop the role column from profiles
alter table profiles drop column if exists role;

-- 3. Drop the index on profiles.role
drop index if exists idx_profiles_role;

-- 4. Drop the user_role enum type
drop type if exists user_role;

-- 5. Simplify the handle_new_user trigger — no role assignment
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

-- 6. Drop policies that depend on is_admin_of_company BEFORE dropping the function
drop policy if exists company_members_manage on company_members;
drop policy if exists companies_update on companies;

-- 7. Drop the admin-only helper function
drop function if exists public.is_admin_of_company(uuid);

-- 8. Recreate policies — all members can manage
create policy company_members_manage on company_members for all
  using (public.is_member_of_company(company_id));

create policy companies_update on companies for update
  using (public.is_member_of_company(id));
