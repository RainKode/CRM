-- =====================================================================
-- Company-scoped RLS: isolate every table's data by company membership
-- =====================================================================
-- Currently all data tables use is_active_member() which only checks
-- that a user has an active profile — it does NOT check company membership.
-- This migration replaces those policies with company-scoped ones.

-- =====================================================================
-- 1. Security-definer helpers to derive company_id from parent FK
--    (bypasses RLS on parent tables to avoid recursion)
-- =====================================================================

create or replace function public.get_folder_company(p_folder_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from folders where id = p_folder_id;
$$;

create or replace function public.get_pipeline_company(p_pipeline_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from pipelines where id = p_pipeline_id;
$$;

create or replace function public.get_deal_company(p_deal_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from deals where id = p_deal_id;
$$;

create or replace function public.get_batch_company(p_batch_id uuid)
returns uuid language sql stable security definer as $$
  select f.company_id
  from batches b join folders f on f.id = b.folder_id
  where b.id = p_batch_id;
$$;

-- =====================================================================
-- 2. Drop the old blanket policies (created by the do-loop)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'folders','field_definitions','leads','batches','batch_leads',
    'pipelines','pipeline_stages','loss_reasons','deals','deal_stage_history',
    'activities','import_history'
  ] loop
    execute format('drop policy if exists %1$s_member_all on %1$s;', t);
  end loop;
end $$;

-- =====================================================================
-- 3. Create company-scoped policies
-- =====================================================================

-- Tables with direct company_id -----------------------------------------------

-- folders
create policy folders_company_rls on folders for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- pipelines
create policy pipelines_company_rls on pipelines for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- deals
create policy deals_company_rls on deals for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- loss_reasons
create policy loss_reasons_company_rls on loss_reasons for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- Tables scoped via folder_id → folders.company_id ---------------------------

-- field_definitions
create policy field_definitions_company_rls on field_definitions for all
  using  (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- leads
create policy leads_company_rls on leads for all
  using  (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- batches
create policy batches_company_rls on batches for all
  using  (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- import_history
create policy import_history_company_rls on import_history for all
  using  (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- Tables scoped via batch_id → batches → folders.company_id ------------------

-- batch_leads
create policy batch_leads_company_rls on batch_leads for all
  using  (public.is_member_of_company(public.get_batch_company(batch_id)))
  with check (public.is_member_of_company(public.get_batch_company(batch_id)));

-- Tables scoped via pipeline_id → pipelines.company_id -----------------------

-- pipeline_stages
create policy pipeline_stages_company_rls on pipeline_stages for all
  using  (public.is_member_of_company(public.get_pipeline_company(pipeline_id)))
  with check (public.is_member_of_company(public.get_pipeline_company(pipeline_id)));

-- Tables scoped via deal_id → deals.company_id -------------------------------

-- deal_stage_history
create policy deal_stage_history_company_rls on deal_stage_history for all
  using  (public.is_member_of_company(public.get_deal_company(deal_id)))
  with check (public.is_member_of_company(public.get_deal_company(deal_id)));

-- activities
create policy activities_company_rls on activities for all
  using  (public.is_member_of_company(public.get_deal_company(deal_id)))
  with check (public.is_member_of_company(public.get_deal_company(deal_id)));
