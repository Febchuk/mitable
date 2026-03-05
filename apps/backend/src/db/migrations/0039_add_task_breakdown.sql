-- Add task_breakdown JSONB column to monitoring_sessions
-- Stores structured task data: [{ shortTitle, description, minutes }]
-- Used for accordion UI with progress bars per task
ALTER TABLE monitoring_sessions ADD COLUMN IF NOT EXISTS task_breakdown jsonb;
