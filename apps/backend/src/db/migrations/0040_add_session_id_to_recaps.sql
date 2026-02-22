-- Migration 0040: Add session_id to recaps table
-- Links auto-created recaps to their source monitoring session.
-- Nullable because manually-created recaps can span multiple sessions.

ALTER TABLE recaps ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES monitoring_sessions(id) ON DELETE SET NULL;

-- Index for fast lookup of recap by session
CREATE INDEX IF NOT EXISTS idx_recaps_session_id ON recaps (session_id) WHERE session_id IS NOT NULL;
