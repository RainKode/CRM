-- Change quality_rating from smallint (1-5) to numeric (0-10, allows decimals like 5.5, 6.7)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_quality_rating_check;
ALTER TABLE leads ALTER COLUMN quality_rating TYPE numeric(3,1) USING quality_rating::numeric(3,1);
ALTER TABLE leads ADD CONSTRAINT leads_quality_rating_check CHECK (quality_rating >= 0 AND quality_rating <= 10);
