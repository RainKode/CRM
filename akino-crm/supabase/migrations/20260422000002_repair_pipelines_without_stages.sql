-- Repair pipelines that have no pipeline_stages rows.
-- For each affected non-archived pipeline:
--   1. Copy stages from another non-archived pipeline in the same folder (preferred).
--   2. Fall back to inserting the 6 default stages if no donor exists.
-- Runs in a single transaction; safe to re-run (no-op if all pipelines already have stages).

BEGIN;

DO $$
DECLARE
  orphan   RECORD;
  donor_id uuid;
BEGIN
  FOR orphan IN
    SELECT p.id, p.folder_id
    FROM   pipelines p
    WHERE  p.is_archived = FALSE
      AND  NOT EXISTS (
             SELECT 1
             FROM   pipeline_stages ps
             WHERE  ps.pipeline_id = p.id
               AND  ps.is_archived = FALSE
           )
  LOOP
    -- Find a sibling pipeline in the same folder that already has stages.
    SELECT p2.id INTO donor_id
    FROM   pipelines p2
    WHERE  p2.folder_id   = orphan.folder_id
      AND  p2.id         <> orphan.id
      AND  p2.is_archived = FALSE
      AND  EXISTS (
             SELECT 1
             FROM   pipeline_stages ps
             WHERE  ps.pipeline_id = p2.id
               AND  ps.is_archived = FALSE
           )
    ORDER  BY p2.created_at
    LIMIT  1;

    IF donor_id IS NOT NULL THEN
      -- Copy stages from the donor, preserving name/position/flags.
      INSERT INTO pipeline_stages (pipeline_id, name, position, is_won, is_lost)
      SELECT orphan.id, ps.name, ps.position, ps.is_won, ps.is_lost
      FROM   pipeline_stages ps
      WHERE  ps.pipeline_id = donor_id
        AND  ps.is_archived = FALSE;
    ELSE
      -- No donor found – insert the 6 standard default stages.
      INSERT INTO pipeline_stages (pipeline_id, name, position, is_won, is_lost)
      VALUES
        (orphan.id, 'Lead',      0, FALSE, FALSE),
        (orphan.id, 'Contacted', 1, FALSE, FALSE),
        (orphan.id, 'Qualified', 2, FALSE, FALSE),
        (orphan.id, 'Proposal',  3, FALSE, FALSE),
        (orphan.id, 'Won',       4, TRUE,  FALSE),
        (orphan.id, 'Lost',      5, FALSE, TRUE);
    END IF;
  END LOOP;
END $$;

COMMIT;
