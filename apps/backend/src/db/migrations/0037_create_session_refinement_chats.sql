-- Migration 0037: Create session_refinement_chats table
-- Stores chat history between users and the refinement AI for each session.
-- Used for:
--   1. Persisting conversation across sessions (user can resume)
--   2. Extra context layer — docs LLM can query these chats for richer session understanding

CREATE TABLE IF NOT EXISTS session_refinement_chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages      JSONB NOT NULL DEFAULT '[]',    -- Array of { role: 'user'|'assistant', content: string, timestamp: ISO }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One chat per session per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_refinement_chats_session_user
  ON session_refinement_chats (session_id, user_id);

-- For docs LLM: find all chats for sessions in an org (join through monitoring_sessions)
CREATE INDEX IF NOT EXISTS idx_refinement_chats_session
  ON session_refinement_chats (session_id);
