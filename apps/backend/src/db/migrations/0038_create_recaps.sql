-- Migration 0038: Create recaps table
-- Stores user-created recap documents that summarize work across sessions/blocks.

CREATE TABLE IF NOT EXISTS recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  blocks JSONB NOT NULL DEFAULT '[]',
  total_duration INTEGER NOT NULL DEFAULT 0,
  deliveries JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recaps_user_id ON recaps (user_id);
CREATE INDEX IF NOT EXISTS idx_recaps_created_at ON recaps (user_id, created_at DESC);
