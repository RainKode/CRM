-- =====================================================================
-- Link pipelines to folders and batches
-- =====================================================================

-- Add folder_id and batch_id to pipelines
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_folder ON pipelines(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipelines_batch ON pipelines(batch_id) WHERE batch_id IS NOT NULL;
