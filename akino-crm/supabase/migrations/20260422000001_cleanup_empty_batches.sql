-- Migration: clean up empty "ghost" batches
-- Context: a bug in createMultipleBatches inserted the `batches` row before
-- the `batch_leads` rows. If the batch_leads insert failed (e.g. due to the
-- uniq_lead_active_batch partial-unique index), the batches row was left
-- behind with zero leads (Total = 0 on the UI).
--
-- Safe heuristic: delete batches that
--   1. have zero batch_leads rows (Total = 0), AND
--   2. have no description AND no assignee_id
--      (these were auto-created by the wizard, not manually customised).
--
-- This will NOT touch batches that a user has set a description or assigned
-- to a team member, even if they happen to be empty.
--
-- Run this once against your Supabase project after deploying the code fix.
-- Verify first with the SELECT below, then uncomment the DELETE.

-- Preview (run this to see what would be deleted):
-- SELECT b.id, b.name, b.created_at
-- FROM batches b
-- WHERE NOT EXISTS (
--   SELECT 1 FROM batch_leads bl WHERE bl.batch_id = b.id
-- )
--   AND b.description IS NULL
--   AND b.assignee_id IS NULL;

-- Archive the auto-created pipelines for ghost batches first so the FK
-- reference is cleaned up before the batch row is removed.
UPDATE pipelines
SET is_archived = true
WHERE batch_id IN (
  SELECT b.id
  FROM batches b
  WHERE NOT EXISTS (
    SELECT 1 FROM batch_leads bl WHERE bl.batch_id = b.id
  )
    AND b.description IS NULL
    AND b.assignee_id IS NULL
)
  AND is_archived = false;

-- Delete the ghost batches.
-- batch_leads rows are already empty; the ON DELETE CASCADE is a no-op here.
DELETE FROM batches
WHERE id IN (
  SELECT b.id
  FROM batches b
  WHERE NOT EXISTS (
    SELECT 1 FROM batch_leads bl WHERE bl.batch_id = b.id
  )
    AND b.description IS NULL
    AND b.assignee_id IS NULL
);
