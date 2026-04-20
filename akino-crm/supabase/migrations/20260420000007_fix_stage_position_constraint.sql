-- Fix unique constraint on pipeline_stages to be scoped per pipeline
-- The old constraint was on (position) alone, which breaks with multiple pipelines

DROP INDEX IF EXISTS uniq_pipeline_stage_position;
CREATE UNIQUE INDEX uniq_pipeline_stage_position
  ON pipeline_stages(pipeline_id, position) WHERE is_archived = false;
