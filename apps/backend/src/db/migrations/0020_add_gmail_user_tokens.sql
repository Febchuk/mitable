-- Add Gmail OAuth columns to users table (per-user email sending)
-- Following the same pattern as Linear OAuth tokens

ALTER TABLE users ADD COLUMN gmail_access_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN gmail_refresh_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN gmail_token_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN gmail_user_email VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN users.gmail_access_token_encrypted IS 'Encrypted Gmail OAuth access token for sending emails from user account';
COMMENT ON COLUMN users.gmail_refresh_token_encrypted IS 'Encrypted Gmail OAuth refresh token';
COMMENT ON COLUMN users.gmail_token_expires_at IS 'Expiration timestamp for Gmail access token';
COMMENT ON COLUMN users.gmail_user_email IS 'Gmail email address associated with the OAuth connection';
