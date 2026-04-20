-- Add website and decision_maker columns to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS decision_maker text;
