-- Migration 0011: Add structure-aware metadata columns for Slack
-- Date: 2025-11-25
-- Purpose: Support thread-aware chunking and smart retrieval for Slack messages

-- Add new columns to search_content table
ALTER TABLE search_content 
ADD COLUMN IF NOT EXISTS chunk_type TEXT,
ADD COLUMN IF NOT EXISTS authors TEXT[], -- Array of usernames
ADD COLUMN IF NOT EXISTS mentioned_users TEXT[], -- Array of mentioned user IDs
ADD COLUMN IF NOT EXISTS has_code BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS code_language TEXT,
ADD COLUMN IF NOT EXISTS has_links BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_reactions BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reaction_summary JSONB,
ADD COLUMN IF NOT EXISTS thread_id TEXT,
ADD COLUMN IF NOT EXISTS is_thread_root BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS message_ids TEXT[]; -- Array of message timestamps

-- Create indexes for filtering and boosting
CREATE INDEX IF NOT EXISTS idx_search_content_chunk_type ON search_content(chunk_type) WHERE source = 'slack';
CREATE INDEX IF NOT EXISTS idx_search_content_has_code ON search_content(has_code) WHERE source = 'slack' AND has_code = TRUE;
CREATE INDEX IF NOT EXISTS idx_search_content_code_language ON search_content(code_language) WHERE source = 'slack' AND code_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_content_thread_id ON search_content(thread_id) WHERE source = 'slack';
CREATE INDEX IF NOT EXISTS idx_search_content_authors ON search_content USING GIN(authors) WHERE source = 'slack';

-- Add comment
COMMENT ON COLUMN search_content.chunk_type IS 'Type of chunk: message_window, code, log, thread_summary, text';
COMMENT ON COLUMN search_content.authors IS 'Array of usernames who authored messages in this chunk';
COMMENT ON COLUMN search_content.mentioned_users IS 'Array of user IDs mentioned in this chunk';
COMMENT ON COLUMN search_content.has_code IS 'Whether this chunk contains code blocks';
COMMENT ON COLUMN search_content.code_language IS 'Programming language of code blocks (sql, typescript, python, etc.)';
COMMENT ON COLUMN search_content.has_links IS 'Whether this chunk contains links';
COMMENT ON COLUMN search_content.has_attachments IS 'Whether this chunk has file attachments';
COMMENT ON COLUMN search_content.has_reactions IS 'Whether messages in this chunk have reactions';
COMMENT ON COLUMN search_content.reaction_summary IS 'Summary of reactions (emoji -> count mapping)';
COMMENT ON COLUMN search_content.thread_id IS 'Slack thread_ts identifier for grouping messages';
COMMENT ON COLUMN search_content.is_thread_root IS 'Whether this chunk contains the root message of a thread';
COMMENT ON COLUMN search_content.message_ids IS 'Array of message timestamps included in this chunk';
