-- Migration: Add user_id column to session_chunks for efficient user queries
-- Addresses performance issue where user filtering required JOIN to monitoring_sessions

-- Add user_id column
ALTER TABLE session_chunks 
ADD COLUMN user_id UUID REFERENCES users(id);

-- Backfill existing records by joining to monitoring_sessions
UPDATE session_chunks sc
SET user_id = ms.user_id
FROM monitoring_sessions ms
WHERE sc.session_id = ms.id;

-- Make it NOT NULL after backfill
ALTER TABLE session_chunks 
ALTER COLUMN user_id SET NOT NULL;

-- Create index for efficient user-based queries
CREATE INDEX idx_session_chunks_user_id ON session_chunks(user_id);
