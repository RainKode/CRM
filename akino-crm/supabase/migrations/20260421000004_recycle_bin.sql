-- =====================================================================
-- Recycle Bin — soft-delete for deals + leads (Slice 2)
-- =====================================================================
-- Goal: users can delete a deal or a lead and still get it back for up
-- to 30 days. After that, purge permanently.
--
-- Strategy:
--   1. Add `deleted_at` + `deleted_by` columns on `deals` and `leads`.
--   2. Update RLS so normal queries automatically exclude deleted rows
--      (USING clause gains `deleted_at IS NULL`).
--   3. Expose security-definer RPCs for listing / restoring / purging
--      trash so the /trash UI can "see through" the RLS filter without
--      us having to add `.is("deleted_at", null)` to every read site.
-- =====================================================================

-- 1. Columns --------------------------------------------------------------

alter table deals
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles(id) on delete set null;

alter table leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles(id) on delete set null;

create index if not exists idx_deals_deleted_at
  on deals(company_id, deleted_at)
  where deleted_at is not null;

create index if not exists idx_leads_deleted_at
  on leads(folder_id, deleted_at)
  where deleted_at is not null;

-- 2. RLS — filter out deleted rows from normal traffic --------------------

drop policy if exists deals_company_rls on deals;
create policy deals_company_rls on deals for all
  using  (public.is_member_of_company(company_id) and deleted_at is null)
  with check (public.is_member_of_company(company_id));

drop policy if exists leads_company_rls on leads;
create policy leads_company_rls on leads for all
  using  (public.is_member_of_company(public.get_folder_company(folder_id)) and deleted_at is null)
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- 3. Trash RPCs (security definer — bypass the RLS "deleted_at is null"
--    filter, but check membership manually) --------------------------------

create or replace function public.list_deleted_deals(p_company_id uuid)
returns setof deals
language sql stable security definer
set search_path = public
as $$
  select d.*
  from deals d
  where d.company_id = p_company_id
    and d.deleted_at is not null
    and public.is_member_of_company(p_company_id)
  order by d.deleted_at desc
$$;

create or replace function public.list_deleted_leads(p_company_id uuid)
returns setof leads
language sql stable security definer
set search_path = public
as $$
  select l.*
  from leads l
  join folders f on f.id = l.folder_id
  where f.company_id = p_company_id
    and l.deleted_at is not null
    and public.is_member_of_company(p_company_id)
  order by l.deleted_at desc
$$;

create or replace function public.restore_deal(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from deals where id = p_id;
  if v_company_id is null then
    raise exception 'deal not found';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  update deals
     set deleted_at = null,
         deleted_by = null
   where id = p_id;
end;
$$;

create or replace function public.restore_lead(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select f.company_id into v_company_id
    from leads l join folders f on f.id = l.folder_id
   where l.id = p_id;
  if v_company_id is null then
    raise exception 'lead not found';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  update leads
     set deleted_at = null,
         deleted_by = null
   where id = p_id;
end;
$$;

create or replace function public.purge_deleted_deal(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_deleted_at timestamptz;
begin
  select company_id, deleted_at into v_company_id, v_deleted_at
    from deals where id = p_id;
  if v_company_id is null then
    raise exception 'deal not found';
  end if;
  if v_deleted_at is null then
    raise exception 'deal is not in trash';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  delete from deals where id = p_id;
end;
$$;

create or replace function public.purge_deleted_lead(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_deleted_at timestamptz;
begin
  select f.company_id, l.deleted_at into v_company_id, v_deleted_at
    from leads l join folders f on f.id = l.folder_id
   where l.id = p_id;
  if v_company_id is null then
    raise exception 'lead not found';
  end if;
  if v_deleted_at is null then
    raise exception 'lead is not in trash';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  delete from leads where id = p_id;
end;
$$;

create or replace function public.empty_trash(p_company_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'not authorised';
  end if;
  delete from deals
   where company_id = p_company_id and deleted_at is not null;
  delete from leads l
   using folders f
   where l.folder_id = f.id
     and f.company_id = p_company_id
     and l.deleted_at is not null;
end;
$$;

-- Auto-purge anything soft-deleted more than 30 days ago. Intended to be
-- invoked by a scheduled worker / cron; safe to call on demand.
create or replace function public.auto_purge_trash()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  delete from deals
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';
  delete from leads
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';
end;
$$;

grant execute on function public.list_deleted_deals(uuid) to authenticated;
grant execute on function public.list_deleted_leads(uuid) to authenticated;
grant execute on function public.restore_deal(uuid) to authenticated;
grant execute on function public.restore_lead(uuid) to authenticated;
grant execute on function public.purge_deleted_deal(uuid) to authenticated;
grant execute on function public.purge_deleted_lead(uuid) to authenticated;
grant execute on function public.empty_trash(uuid) to authenticated;
