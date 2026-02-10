-- Migration: Add summarization_progress column to monitoring_sessions
-- Purpose: Track step-based progress during session summarization for UI display
-- Steps: null | 'generating_title' | 'analyzing_activities' | 'writing_summary' | 'finalizing'

ALTER TABLE monitoring_sessions
ADD COLUMN IF NOT EXISTS summarization_progress VARCHAR(50);

COMMENT ON COLUMN monitoring_sessions.summarization_progress IS
  'Current step in the summarization pipeline. Null when not summarizing. Used by the UI to show progress.';
