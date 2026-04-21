-- Add display-field hints to batches so the enrichment queue can show the
-- user's chosen sort/filter field as the primary label instead of always
-- falling back to email.
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS sort_by_field  text,
  ADD COLUMN IF NOT EXISTS filter_by_field text;

-- One-shot cleanup: archive orphan pipelines that were created for batches
-- which have since been deleted (batch_id got NULLed by ON DELETE SET NULL).
-- Only archiving pipelines with 0 active (non-won, non-lost) deals to avoid
-- touching pipelines that have meaningful data.
UPDATE pipelines
SET is_archived = true
WHERE batch_id IS NULL
  AND folder_id IS NOT NULL
  AND is_archived = false
  AND id NOT IN (
    SELECT DISTINCT d.stage_id
    FROM deals d
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    WHERE ps.pipeline_id = pipelines.id
      AND d.won_at IS NULL
      AND d.lost_at IS NULL
  );
