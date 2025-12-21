-- Migration: Add session goal context columns
-- Description: Add columns to support Linear issue integration and RAG-retrieved context
-- Date: 2024-12-20

-- Add Linear issue columns for goal tracking
ALTER TABLE monitoring_sessions
  ADD COLUMN IF NOT EXISTS linear_issue_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS linear_issue_title TEXT,
  ADD COLUMN IF NOT EXISTS linear_issue_description TEXT,
  ADD COLUMN IF NOT EXISTS additional_context TEXT,
  ADD COLUMN IF NOT EXISTS related_docs_context TEXT;

-- Add comments for documentation
COMMENT ON COLUMN monitoring_sessions.linear_issue_id IS 'Linear issue identifier (e.g., LIN-341)';
COMMENT ON COLUMN monitoring_sessions.linear_issue_title IS 'Title of the linked Linear issue';
COMMENT ON COLUMN monitoring_sessions.linear_issue_description IS 'Full description of the linked Linear issue';
COMMENT ON COLUMN monitoring_sessions.additional_context IS 'User-provided free-text context about their work';
COMMENT ON COLUMN monitoring_sessions.related_docs_context IS 'RAG-retrieved related documents at session start';
