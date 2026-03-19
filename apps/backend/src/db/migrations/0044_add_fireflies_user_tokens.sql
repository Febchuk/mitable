-- Migration 0044: Add Fireflies AI integration columns to users table
-- Fireflies uses a simple per-user API key (no OAuth flow needed)

-- Add Fireflies API key (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS fireflies_api_key_encrypted TEXT;

-- Add last sync timestamp (tracks when transcripts were last pulled)
ALTER TABLE users ADD COLUMN IF NOT EXISTS fireflies_last_synced_at TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN users.fireflies_api_key_encrypted IS 'Encrypted Fireflies AI API key for per-user meeting transcript sync';
COMMENT ON COLUMN users.fireflies_last_synced_at IS 'Timestamp of last successful Fireflies transcript sync';
