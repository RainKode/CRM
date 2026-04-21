-- =====================================================================
-- RPC: get_folders_with_counts
-- Returns all folders the caller can see (company-scoped via RLS) plus
-- aggregate counts of leads, enriched leads, and pipelines per folder.
-- The app (app/(authenticated)/folders/actions.ts) calls this on the
-- /folders page; without it the page falls back to an unaggregated query.
-- =====================================================================

create or replace function public.get_folders_with_counts()
returns table (
  id uuid,
  company_id uuid,
  name text,
  description text,
  is_archived boolean,
  dedupe_keys text[],
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  lead_count bigint,
  enriched_count bigint,
  pipeline_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.company_id,
    f.name,
    f.description,
    f.is_archived,
    coalesce(f.dedupe_keys, array[]::text[]) as dedupe_keys,
    f.created_by,
    f.created_at,
    f.updated_at,
    coalesce(lc.cnt, 0)::bigint        as lead_count,
    coalesce(ec.cnt, 0)::bigint        as enriched_count,
    coalesce(pc.cnt, 0)::bigint        as pipeline_count
  from folders f
  left join lateral (
    select count(*)::bigint as cnt
    from leads l
    where l.folder_id = f.id
      and l.deleted_at is null
  ) lc on true
  left join lateral (
    select count(*)::bigint as cnt
    from leads l
    where l.folder_id = f.id
      and l.deleted_at is null
      and l.status in ('enriched', 'in_pipeline')
  ) ec on true
  left join lateral (
    select count(*)::bigint as cnt
    from pipelines p
    where p.folder_id = f.id
  ) pc on true
  where public.is_member_of_company(f.company_id)
  order by f.created_at desc
$$;

grant execute on function public.get_folders_with_counts() to authenticated;
