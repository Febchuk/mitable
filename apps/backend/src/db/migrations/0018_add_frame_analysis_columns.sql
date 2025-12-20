-- Migration: Add frame analysis columns for Sessions Architecture v2
-- This enables delta detection, importance scoring, and Top-K frame selection

-- Add session_goal to monitoring_sessions (improves on_task detection)
ALTER TABLE monitoring_sessions
ADD COLUMN IF NOT EXISTS session_goal TEXT;

-- Add delta detection columns to session_captures
ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS delta_changed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS delta_change_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS delta_change_description TEXT,
ADD COLUMN IF NOT EXISTS delta_user_action VARCHAR(20);

-- Add per-window task relevance columns
ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS on_task BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS task_relevance TEXT;

-- Add importance scoring columns for Top-K selection
ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS importance_score REAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS importance_reason TEXT;

-- Add flag for Top-K selected frames
ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS selected_for_export BOOLEAN DEFAULT FALSE;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_captures_importance
ON session_captures(session_id, importance_score DESC);

CREATE INDEX IF NOT EXISTS idx_captures_on_task
ON session_captures(session_id, on_task)
WHERE on_task = TRUE;

CREATE INDEX IF NOT EXISTS idx_captures_delta
ON session_captures(session_id, delta_changed)
WHERE delta_changed = TRUE;

-- Comment on new columns
COMMENT ON COLUMN monitoring_sessions.session_goal IS 'Optional user-provided goal for improved on_task detection';
COMMENT ON COLUMN session_captures.delta_changed IS 'Whether content changed from previous frame';
COMMENT ON COLUMN session_captures.delta_change_type IS 'Type: content_edit, navigation, scroll, file_switch, focus_change, none';
COMMENT ON COLUMN session_captures.delta_user_action IS 'Action: typing, clicking, scrolling, viewing, unknown';
COMMENT ON COLUMN session_captures.on_task IS 'Whether this frame is related to the session goal';
COMMENT ON COLUMN session_captures.importance_score IS '0-1 score for Top-K selection (higher = more important)';
COMMENT ON COLUMN session_captures.selected_for_export IS 'TRUE if selected for cloud upload (Top-K)';
