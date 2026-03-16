-- Migration 0039: Add Granola OAuth token columns to users table
-- These columns store per-user Granola OAuth tokens for meeting note sync

-- Add Granola access token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS granola_access_token_encrypted TEXT;

-- Add Granola refresh token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS granola_refresh_token_encrypted TEXT;

-- Add Granola token expiration timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS granola_token_expires_at TIMESTAMP;

-- Add Granola user email (for display purposes)
ALTER TABLE users ADD COLUMN IF NOT EXISTS granola_user_email VARCHAR(255);

-- Add last sync timestamp (tracks when notes were last pulled)
ALTER TABLE users ADD COLUMN IF NOT EXISTS granola_last_synced_at TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN users.granola_access_token_encrypted IS 'Encrypted Granola OAuth access token for per-user meeting note sync';
COMMENT ON COLUMN users.granola_refresh_token_encrypted IS 'Encrypted Granola OAuth refresh token';
COMMENT ON COLUMN users.granola_token_expires_at IS 'Granola token expiration timestamp';
COMMENT ON COLUMN users.granola_user_email IS 'User email associated with their Granola account';
COMMENT ON COLUMN users.granola_last_synced_at IS 'Timestamp of last successful Granola notes sync';
