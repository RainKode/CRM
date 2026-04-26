-- =====================================================================
-- Recycle Bin — soft-delete for folders (Phase 2)
-- =====================================================================
-- Mirrors the deals/leads pattern from 20260421000005_recycle_bin.sql.
-- Folder soft-delete does NOT cascade to children — child leads/batches/
-- pipelines remain intact. Restoring is therefore lossless.
-- =====================================================================

-- 1. Columns ----------------------------------------------------------

alter table folders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles(id) on delete set null;

create index if not exists idx_folders_deleted
  on folders(company_id, deleted_at)
  where deleted_at is not null;

-- 2. RLS — filter out soft-deleted folders from normal traffic --------
-- (folders table already has an RLS policy; drop & recreate to add the
--  deleted_at guard without touching other tables)

drop policy if exists folders_company_rls on folders;
create policy folders_company_rls on folders for all
  using  (public.is_member_of_company(company_id) and deleted_at is null)
  with check (public.is_member_of_company(company_id));

-- 3. Trash RPCs -------------------------------------------------------

create or replace function public.list_deleted_folders(p_company_id uuid)
returns table(
  id          uuid,
  company_id  uuid,
  name        text,
  description text,
  is_archived boolean,
  dedupe_keys text[],
  created_by  uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  deleted_at  timestamptz,
  deleted_by  uuid,
  lead_count  bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'not authorised';
  end if;

  return query
  select
    f.id,
    f.company_id,
    f.name,
    f.description,
    f.is_archived,
    f.dedupe_keys,
    f.created_by,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    f.deleted_by,
    count(l.id) as lead_count
  from folders f
  left join leads l on l.folder_id = f.id
  where f.company_id = p_company_id
    and f.deleted_at is not null
  group by f.id
  order by f.deleted_at desc;
end;
$$;

create or replace function public.restore_folder(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from folders where id = p_id;
  if v_company_id is null then
    raise exception 'folder not found';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  update folders
     set deleted_at = null,
         deleted_by = null
   where id = p_id;
end;
$$;

create or replace function public.purge_deleted_folder(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_deleted_at timestamptz;
begin
  select company_id, deleted_at into v_company_id, v_deleted_at
    from folders where id = p_id;
  if v_company_id is null then
    raise exception 'folder not found';
  end if;
  if v_deleted_at is null then
    raise exception 'folder is not in trash';
  end if;
  if not public.is_member_of_company(v_company_id) then
    raise exception 'not authorised';
  end if;
  delete from folders where id = p_id;
end;
$$;

-- 4. Extend empty_trash to also purge soft-deleted folders ------------

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
  delete from folders
   where company_id = p_company_id and deleted_at is not null;
end;
$$;

-- 5. Auto-purge function (invoked by daily cron) ----------------------

create or replace function public.purge_old_trash()
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
  delete from folders
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';
end;
$$;

grant execute on function public.list_deleted_folders(uuid) to authenticated;
grant execute on function public.restore_folder(uuid) to authenticated;
grant execute on function public.purge_deleted_folder(uuid) to authenticated;
grant execute on function public.purge_old_trash() to service_role;
