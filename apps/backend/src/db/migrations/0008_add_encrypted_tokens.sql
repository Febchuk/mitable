-- Migration: Add encrypted token columns
-- Phase: EXPAND (add new columns, keep old ones)
-- Purpose: Zero-downtime migration to encrypted tokens
-- 
-- This migration adds encrypted token columns alongside existing plaintext columns.
-- The application will dual-write to both columns during transition period.
-- After backfill is complete and verified, we'll drop the plaintext columns in a separate migration.

-- Add encrypted token columns
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
ADD COLUMN IF NOT EXISTS encryption_version integer DEFAULT 1;

-- Add comments for documentation
COMMENT ON COLUMN integrations.access_token_encrypted IS 'AES-256-GCM encrypted access token (format: iv:authTag:ciphertext)';
COMMENT ON COLUMN integrations.refresh_token_encrypted IS 'AES-256-GCM encrypted refresh token (format: iv:authTag:ciphertext)';
COMMENT ON COLUMN integrations.encryption_version IS 'Encryption algorithm version (1 = AES-256-GCM)';

-- Mark old columns as deprecated
COMMENT ON COLUMN integrations.access_token IS 'DEPRECATED: Use access_token_encrypted. Will be dropped after migration.';
COMMENT ON COLUMN integrations.refresh_token IS 'DEPRECATED: Use refresh_token_encrypted. Will be dropped after migration.';
