-- =====================================================================
-- Folder Summary Stats RPC
-- =====================================================================
-- Returns per-folder counts including enriched/total leads, active deal
-- counts, and a breakdown of deals by stage name.
-- =====================================================================

create or replace function public.get_folder_summary_stats(p_company_id uuid)
returns table(
  folder_id    uuid,
  folder_name  text,
  total_leads  bigint,
  enriched_leads bigint,
  active_deals bigint,
  stage_breakdown jsonb,
  last_activity  timestamptz
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
    f.id                                              as folder_id,
    f.name                                            as folder_name,
    count(distinct l.id)                              as total_leads,
    count(distinct l.id) filter (where l.enriched_at is not null) as enriched_leads,
    count(distinct d.id) filter (
      where d.won_at is null and d.lost_at is null and d.deleted_at is null
    )                                                 as active_deals,
    coalesce(
      jsonb_object_agg(
        ps.name,
        stage_counts.cnt
      ) filter (where ps.name is not null),
      '{}'::jsonb
    )                                                 as stage_breakdown,
    max(d.updated_at)                                 as last_activity
  from folders f
  left join leads l
    on l.folder_id = f.id
    and l.deleted_at is null
  left join (
    -- count deals per stage for this company
    select d2.stage_id, count(*) as cnt
    from deals d2
    join pipelines p2 on p2.id = d2.pipeline_id
    where p2.company_id = p_company_id
      and d2.deleted_at is null
      and d2.won_at is null
      and d2.lost_at is null
    group by d2.stage_id
  ) stage_counts on true
  left join pipeline_stages ps on ps.id = stage_counts.stage_id
    and ps.is_archived = false
  left join deals d
    on d.pipeline_id in (
      select id from pipelines where folder_id = f.id and company_id = p_company_id
    )
  where f.company_id = p_company_id
    and f.is_archived = false
    and coalesce(f.deleted_at::text, '') = ''
  group by f.id, f.name
  order by f.created_at desc;
end;
$$;

grant execute on function public.get_folder_summary_stats(uuid) to authenticated;
