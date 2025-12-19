-- Migration 0017: Add Linear OAuth token columns to users table
-- These columns store per-user Linear OAuth tokens for session updates

-- Add Linear access token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS linear_access_token_encrypted TEXT;

-- Add Linear refresh token (encrypted)
ALTER TABLE users ADD COLUMN IF NOT EXISTS linear_refresh_token_encrypted TEXT;

-- Add Linear token expiration timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS linear_token_expires_at TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN users.linear_access_token_encrypted IS 'Encrypted Linear OAuth access token for per-user session updates';
COMMENT ON COLUMN users.linear_refresh_token_encrypted IS 'Encrypted Linear OAuth refresh token';
COMMENT ON COLUMN users.linear_token_expires_at IS 'Linear token expiration timestamp';
