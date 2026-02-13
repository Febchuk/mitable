-- Migration 0036: Create user_memories table
-- Stores AI-generated user preferences/memories for personalized summaries, docs, etc.

CREATE TABLE IF NOT EXISTS user_memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,           -- 'summary_style', 'doc_style', 'general'
  content       TEXT NOT NULL,           -- the actual memory text
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by user + category
CREATE INDEX IF NOT EXISTS idx_user_memories_user_category ON user_memories (user_id, category);

-- Index for org-level queries
CREATE INDEX IF NOT EXISTS idx_user_memories_org ON user_memories (org_id);
