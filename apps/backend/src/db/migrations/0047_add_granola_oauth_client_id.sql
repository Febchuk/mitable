-- Migration 0047: Add granola_oauth_client_id to users table
--
-- Persists the OAuth client_id used during Granola authorization.
-- Without this, dynamic client registration creates a NEW client_id on every
-- server restart, causing refresh tokens (bound to the old client_id) to fail
-- with "invalid_refresh_token".

ALTER TABLE users
ADD COLUMN IF NOT EXISTS granola_oauth_client_id VARCHAR(255);
