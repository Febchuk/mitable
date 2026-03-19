-- Migration 0045: Add raw_transcript column to activity_blocks
-- Stores the full speaker-by-speaker transcript from Fireflies meetings.
-- Used by the agent for conversational Q&A about meeting details.
-- The existing `description` column holds the AI-generated summary for calendar display.

ALTER TABLE activity_blocks
ADD COLUMN IF NOT EXISTS raw_transcript TEXT;

COMMENT ON COLUMN activity_blocks.raw_transcript IS 'Full meeting transcript (speaker + text) for agent context. Populated by Fireflies sync.';
