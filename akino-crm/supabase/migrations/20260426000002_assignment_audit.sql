-- =====================================================================
-- Migration: Assignment audit columns on deals and batches
--
-- Adds `assigned_at` and `assigned_by` to deals and batches so we can
-- show "who reassigned what when" for the team/leaderboard views.
--
-- `owner_id` (deals) and `assignee_id` (batches) remain NULLABLE.
-- Backfill scripts (scripts/backfill-deals.ts, lib/unipile/backfill.ts)
-- and any future automated ingest paths can continue to insert without
-- an owner; null-owned rows surface in the "Unassigned" bucket on /team.
-- =====================================================================

alter table deals
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references profiles(id) on delete set null;

alter table batches
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references profiles(id) on delete set null;

-- Supports leaderboard "recent activity" sort
create index if not exists idx_deals_owner_assigned_at
  on deals(owner_id, assigned_at desc);

create index if not exists idx_batches_assignee_assigned_at
  on batches(assignee_id, assigned_at desc);
