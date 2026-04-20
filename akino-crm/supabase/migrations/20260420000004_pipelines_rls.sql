-- Enable RLS on pipelines table (missed in previous migration)
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

-- Active members can read all pipelines
CREATE POLICY pipelines_member_all ON pipelines FOR ALL
  USING (public.is_active_member())
  WITH CHECK (public.is_active_member());
