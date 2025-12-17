-- Migration 0016: Add image_data column to session_captures
-- This stores base64 encoded screenshots for backend AI analysis
-- Previously, screenshots were stored locally on client machines and inaccessible to the backend

ALTER TABLE session_captures
ADD COLUMN IF NOT EXISTS image_data TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN session_captures.image_data IS 'Base64 encoded screenshot image for AI analysis';
