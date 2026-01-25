-- Migration 0025: Add classifier_data column to session_captures
-- Stores full Classifier RLM output (events, entities, metrics, actionType)
-- This enables Storyteller to build semantic narratives with rich context

ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS classifier_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN session_captures.classifier_data IS 'Full Classifier RLM output: events, entities, metrics, actionType for semantic narrative building';

-- Create index for queries filtering on classifier_data
CREATE INDEX IF NOT EXISTS idx_captures_classifier_data
ON session_captures USING GIN (classifier_data)
WHERE classifier_data IS NOT NULL;
