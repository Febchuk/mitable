-- Add scoring_rubric column to benchmark_parameters
-- Stores a frozen rubric generated at parameter creation/edit time
-- so scoring evaluates against fixed criteria for deterministic results.

ALTER TABLE benchmark_parameters
ADD COLUMN IF NOT EXISTS scoring_rubric JSONB;
