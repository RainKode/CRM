-- =====================================================================
-- Multiple Pipelines support
-- =====================================================================

-- 1. Create pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add pipeline_id to pipeline_stages
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES pipelines(id) ON DELETE CASCADE;

-- 3. Insert a default pipeline and assign all existing stages to it
DO $$
DECLARE
  default_pipeline_id uuid;
BEGIN
  INSERT INTO pipelines (name, is_default) VALUES ('Default Pipeline', true)
  RETURNING id INTO default_pipeline_id;
  
  UPDATE pipeline_stages SET pipeline_id = default_pipeline_id WHERE pipeline_id IS NULL;
END $$;

-- 4. Make pipeline_id NOT NULL after backfill
ALTER TABLE pipeline_stages ALTER COLUMN pipeline_id SET NOT NULL;

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
