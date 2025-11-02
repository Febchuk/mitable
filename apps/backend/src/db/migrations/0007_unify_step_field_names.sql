-- Migration: Unify step field names (stepDescription → description)
-- Created: 2025-10-31
-- Purpose: Update existing workflow_data JSONB to use consistent 'description' field

-- Update workflow_sessions table: rename stepDescription to description in stepList
UPDATE workflow_sessions
SET workflow_data = jsonb_set(
  workflow_data,
  '{stepList}',
  (
    SELECT jsonb_agg(
      jsonb_set(
        step - 'stepDescription',
        '{description}',
        COALESCE(step->'description', step->'stepDescription')
      )
    )
    FROM jsonb_array_elements(workflow_data->'stepList') AS step
  )
)
WHERE workflow_data->'stepList' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(workflow_data->'stepList') AS step
    WHERE step ? 'stepDescription'
  );

-- Verification query (run after migration to verify)
-- SELECT 
--   id,
--   solution,
--   (workflow_data->'stepList')::text as step_list
-- FROM workflow_sessions
-- WHERE workflow_data->'stepList' IS NOT NULL
-- LIMIT 5;