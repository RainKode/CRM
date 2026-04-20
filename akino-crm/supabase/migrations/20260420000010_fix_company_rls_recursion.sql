-- Fix infinite recursion in company/company_members RLS policies.
-- The company_members_read policy queries company_members itself, causing
-- infinite recursion. Same pattern as the profiles RLS fix in migration
-- 20260419000001. Solution: security-definer helper that bypasses RLS.

-- Helper: check if current user belongs to a given company (bypasses RLS)
create or replace function public.is_member_of_company(p_company_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id
      and user_id = auth.uid()
  );
$$;

-- Helper: check if current user is admin of a given company (bypasses RLS)
create or replace function public.is_admin_of_company(p_company_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Fix company_members policies
drop policy if exists company_members_read on company_members;
create policy company_members_read on company_members for select
  using (public.is_member_of_company(company_id));

drop policy if exists company_members_manage on company_members;
create policy company_members_manage on company_members for all
  using (public.is_admin_of_company(company_id));

-- Fix companies policies (they reference company_members which has RLS)
drop policy if exists companies_member_read on companies;
create policy companies_member_read on companies for select
  using (public.is_member_of_company(id));

drop policy if exists companies_update on companies;
create policy companies_update on companies for update
  using (public.is_admin_of_company(id));
