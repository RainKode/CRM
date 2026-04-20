-- Add quality rating (1-5 stars) to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_rating smallint CHECK (quality_rating BETWEEN 1 AND 5);
CREATE INDEX IF NOT EXISTS idx_leads_quality ON leads(folder_id, quality_rating);
