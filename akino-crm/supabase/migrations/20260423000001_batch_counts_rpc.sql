-- =====================================================================
-- RPC: batch_counts
-- Returns total + completed counts for a list of batch IDs in a single
-- round trip. Replaces the previous approach of fetching every
-- `batch_leads` row with `.in("batch_id", ids)` and aggregating in JS,
-- which silently truncated at PostgREST's ~1000-row cap. That caused the
-- enrichment dashboard to show "total 0, done 0" for large batches once
-- the combined row count crossed the limit.
--
-- Used by:
--   - app/(authenticated)/enrichment/actions.ts :: getBatches
--   - app/(authenticated)/enrichment/actions.ts :: getBatchesGroupedByFolder
-- =====================================================================

create or replace function public.batch_counts(batch_ids uuid[])
returns table (
  batch_id uuid,
  total bigint,
  completed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bl.batch_id,
    count(*)::bigint                                       as total,
    count(*) filter (where bl.is_completed)::bigint        as completed
  from batch_leads bl
  where bl.batch_id = any(batch_ids)
  group by bl.batch_id
$$;

grant execute on function public.batch_counts(uuid[]) to authenticated;
