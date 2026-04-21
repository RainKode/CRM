-- =====================================================================
-- Performance indexes for hot query paths (April 2026 audit)
-- =====================================================================
-- Added after discovering N+1 patterns in:
--   - enrichment.actions.ts (getBatches / getBatchesGroupedByFolder)
--   - dashboard follow-up queue
--   - pipeline kanban board
--
-- Safe to re-run: all `create index if not exists`.
-- Uses `concurrently` where Postgres allows (outside transaction).
-- Supabase migrations run in a transaction so we use the non-concurrent
-- form; migrations are applied during low-traffic windows anyway.
-- =====================================================================

-- Drives the batch-count aggregate query used on every enrichment page load.
-- Filters by batch_id and (optionally) is_completed = true.
create index if not exists idx_batch_leads_batch_completed
  on batch_leads(batch_id, is_completed);

-- Drives the dashboard follow-up queue:
--   "deals where owner = me AND follow_up_at <= now()"
create index if not exists idx_deals_owner_followup
  on deals(owner_id, follow_up_at)
  where follow_up_at is not null
    and won_at is null
    and lost_at is null;

-- Drives the kanban board: deals grouped by company + stage, open only.
create index if not exists idx_deals_company_stage_open
  on deals(company_id, stage_id)
  where won_at is null and lost_at is null;

-- Drives the lead list default view within a folder (by status).
-- Existing idx_leads_status covers this, but an explicit compound with
-- ordering column helps when sorting by created_at.
create index if not exists idx_leads_folder_status_created
  on leads(folder_id, status, created_at desc);

-- Notifications dropdown: unread for a user, newest first.
create index if not exists idx_notifications_user_unread
  on notifications(user_id, created_at desc)
  where is_read = false;

-- Pipeline stages list (unarchived, ordered) — already has a unique
-- index on (pipeline_id, position) where not archived; add a plain
-- covering index for the common SELECT path so scans don't hit the
-- unique index.
create index if not exists idx_pipeline_stages_pipeline_position
  on pipeline_stages(pipeline_id, position)
  where is_archived = false;
