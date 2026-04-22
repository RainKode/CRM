-- =====================================================================
-- Migration: 20260422000003_pipeline_templates
-- Introduces pipeline_templates + pipeline_template_stages tables.
-- Backfills one "Default" template per company from existing data.
-- Backfills template_id on all existing pipeline instances.
-- Heals all stage-less pipeline instances from their template.
-- Adds unique (company_id, batch_id) constraint on pipelines.
-- Safe to re-run (idempotent via IF NOT EXISTS / WHERE checks).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. pipeline_templates
-- =====================================================================
CREATE TABLE IF NOT EXISTS pipeline_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  is_default  boolean     NOT NULL DEFAULT false,
  is_archived boolean     NOT NULL DEFAULT false,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_templates_company
  ON pipeline_templates(company_id);

-- =====================================================================
-- 2. pipeline_template_stages
-- =====================================================================
CREATE TABLE IF NOT EXISTS pipeline_template_stages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid        NOT NULL REFERENCES pipeline_templates(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  position    integer     NOT NULL,
  is_won      boolean     NOT NULL DEFAULT false,
  is_lost     boolean     NOT NULL DEFAULT false,
  is_archived boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_template_stage_position
  ON pipeline_template_stages(template_id, position) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_pipeline_template_stages_template
  ON pipeline_template_stages(template_id, position);

-- =====================================================================
-- 3. Add template_id FK to pipelines
-- =====================================================================
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS template_id uuid
    REFERENCES pipeline_templates(id) ON DELETE SET NULL;

-- =====================================================================
-- 4. Enable RLS on new tables
-- =====================================================================
ALTER TABLE pipeline_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_template_stages ENABLE ROW LEVEL SECURITY;

-- Security-definer helper: company from template id
CREATE OR REPLACE FUNCTION public.get_template_company(p_template_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM pipeline_templates WHERE id = p_template_id;
$$;

-- Drop-and-recreate policies so the migration is idempotent
DROP POLICY IF EXISTS pipeline_templates_company_rls ON pipeline_templates;
CREATE POLICY pipeline_templates_company_rls ON pipeline_templates FOR ALL
  USING  (public.is_member_of_company(company_id))
  WITH CHECK (public.is_member_of_company(company_id));

DROP POLICY IF EXISTS pipeline_template_stages_company_rls ON pipeline_template_stages;
CREATE POLICY pipeline_template_stages_company_rls ON pipeline_template_stages FOR ALL
  USING  (public.is_member_of_company(public.get_template_company(template_id)))
  WITH CHECK (public.is_member_of_company(public.get_template_company(template_id)));

-- =====================================================================
-- 5. Backfill: create one "Default" template per company
--    Source priority:
--      1. Company's is_default pipeline that has stages
--      2. Any pipeline in the company with the most stages
--      3. Hard-coded 8-stage canonical default
-- =====================================================================
DO $$
DECLARE
  comp            RECORD;
  tmpl_id         uuid;
  source_pipeline uuid;
  stage_row       RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    -- Idempotent: skip if template already exists for this company
    IF EXISTS (SELECT 1 FROM pipeline_templates WHERE company_id = comp.id) THEN
      CONTINUE;
    END IF;

    -- Insert the template row
    INSERT INTO pipeline_templates (company_id, name, is_default, created_at)
    VALUES (comp.id, 'Default', true, now())
    RETURNING id INTO tmpl_id;

    -- Try: company default pipeline with stages
    SELECT p.id INTO source_pipeline
    FROM   pipelines p
    WHERE  p.company_id  = comp.id
      AND  p.is_default  = TRUE
      AND  p.is_archived = FALSE
      AND  EXISTS (
             SELECT 1 FROM pipeline_stages ps
             WHERE ps.pipeline_id = p.id AND ps.is_archived = FALSE
           )
    ORDER BY p.created_at
    LIMIT 1;

    -- Fallback: any pipeline in the company with the most active stages
    IF source_pipeline IS NULL THEN
      SELECT p.id INTO source_pipeline
      FROM   pipelines p
      JOIN   pipeline_stages ps ON ps.pipeline_id = p.id AND ps.is_archived = FALSE
      WHERE  p.company_id  = comp.id
        AND  p.is_archived = FALSE
      GROUP  BY p.id
      ORDER  BY count(*) DESC
      LIMIT  1;
    END IF;

    IF source_pipeline IS NOT NULL THEN
      -- Clone stages from the source pipeline
      INSERT INTO pipeline_template_stages (template_id, name, position, is_won, is_lost)
      SELECT tmpl_id, ps.name, ps.position, ps.is_won, ps.is_lost
      FROM   pipeline_stages ps
      WHERE  ps.pipeline_id = source_pipeline
        AND  ps.is_archived = FALSE
      ORDER  BY ps.position;
    ELSE
      -- No usable pipeline: seed the 8 canonical stages
      INSERT INTO pipeline_template_stages (template_id, name, position, is_won, is_lost)
      VALUES
        (tmpl_id, 'New',            0, false, false),
        (tmpl_id, 'Contacted',      1, false, false),
        (tmpl_id, 'Responded',      2, false, false),
        (tmpl_id, 'Meeting Booked', 3, false, false),
        (tmpl_id, 'Proposal Sent',  4, false, false),
        (tmpl_id, 'Negotiation',    5, false, false),
        (tmpl_id, 'Won',            6, true,  false),
        (tmpl_id, 'Lost',           7, false, true);
    END IF;

  END LOOP;
END $$;

-- =====================================================================
-- 6. Backfill template_id on every existing pipeline instance
-- =====================================================================
UPDATE pipelines p
SET    template_id = (
         SELECT t.id
         FROM   pipeline_templates t
         WHERE  t.company_id = p.company_id
           AND  t.is_default = TRUE
         LIMIT  1
       )
WHERE  p.template_id IS NULL
  AND  p.company_id  IS NOT NULL;

-- =====================================================================
-- 7. Heal stage-less non-archived pipeline instances
--    Clone stages from template_id (or company default template).
-- =====================================================================
DO $$
DECLARE
  orphan  RECORD;
  tmpl_id uuid;
BEGIN
  FOR orphan IN
    SELECT p.id, p.company_id, p.template_id
    FROM   pipelines p
    WHERE  p.is_archived = FALSE
      AND  NOT EXISTS (
             SELECT 1
             FROM   pipeline_stages ps
             WHERE  ps.pipeline_id = p.id
               AND  ps.is_archived = FALSE
           )
  LOOP
    tmpl_id := orphan.template_id;

    IF tmpl_id IS NULL THEN
      SELECT id INTO tmpl_id
      FROM   pipeline_templates
      WHERE  company_id = orphan.company_id
        AND  is_default = TRUE
      LIMIT  1;
    END IF;

    IF tmpl_id IS NOT NULL THEN
      INSERT INTO pipeline_stages (pipeline_id, name, position, is_won, is_lost)
      SELECT orphan.id, pts.name, pts.position, pts.is_won, pts.is_lost
      FROM   pipeline_template_stages pts
      WHERE  pts.template_id = tmpl_id
        AND  pts.is_archived = FALSE
      ORDER  BY pts.position;
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- 8. Unique constraint: one pipeline instance per (company_id, batch_id)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pipeline_company_batch
  ON pipelines(company_id, batch_id) WHERE batch_id IS NOT NULL;

COMMIT;
