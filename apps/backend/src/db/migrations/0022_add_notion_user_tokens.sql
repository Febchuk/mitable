-- Migration 0022: Add Notion OAuth token columns to users table
-- These columns store per-user Notion OAuth tokens for document exports

-- Add Notion access token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_access_token_encrypted TEXT;

-- Add Notion refresh token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_refresh_token_encrypted TEXT;

-- Add Notion token expiration timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_token_expires_at TIMESTAMP;

-- Add Notion workspace ID for reference
ALTER TABLE users ADD COLUMN IF NOT EXISTS notion_workspace_id VARCHAR(100);

-- Add comments for documentation
COMMENT ON COLUMN users.notion_access_token_encrypted IS 'Encrypted Notion OAuth access token for per-user document exports';
COMMENT ON COLUMN users.notion_refresh_token_encrypted IS 'Encrypted Notion OAuth refresh token';
COMMENT ON COLUMN users.notion_token_expires_at IS 'Notion token expiration timestamp';
COMMENT ON COLUMN users.notion_workspace_id IS 'Notion workspace ID for user connection';
