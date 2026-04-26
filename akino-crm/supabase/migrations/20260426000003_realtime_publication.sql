-- =====================================================================
-- Migration: Add deals + batches to the supabase_realtime publication.
--
-- Required for the team/pipeline live-update feature. Idempotent so it
-- is safe across local resets, branch deploys, and prod re-runs.
-- =====================================================================

-- Ensure the publication exists (Supabase usually creates it, but be defensive)
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;

-- Add deals (no error if already a member)
do $$ begin
  alter publication supabase_realtime add table deals;
exception when duplicate_object then null; end $$;

-- Add batches
do $$ begin
  alter publication supabase_realtime add table batches;
exception when duplicate_object then null; end $$;

-- Add company_members so clients can react to role changes (e.g. demoted-mid-session)
do $$ begin
  alter publication supabase_realtime add table company_members;
exception when duplicate_object then null; end $$;
