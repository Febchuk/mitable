-- Migration: Remove plaintext token columns
-- Phase: CONTRACT (remove old columns after migration complete)
-- Purpose: Complete the zero-downtime migration by dropping deprecated plaintext columns
-- 
-- IMPORTANT: Only run this AFTER:
-- 1. Migration 0008 has been deployed
-- 2. Backfill script has encrypted all existing tokens
-- 3. Application code has been updated to use encrypted columns
-- 4. Verification that no plaintext tokens remain
-- 5. At least 24 hours of production usage with encrypted tokens

-- Drop deprecated plaintext token columns
ALTER TABLE integrations 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

-- The encrypted columns become the primary token storage
-- No need to rename - code already uses access_token_encrypted and refresh_token_encrypted
