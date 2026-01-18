-- Migration: Add Google Docs export tracking to documents table
-- Adds fields to track exported Google Docs documents and sync status

ALTER TABLE documents
ADD COLUMN google_docs_id VARCHAR(100),
ADD COLUMN google_docs_folder_id VARCHAR(100),
ADD COLUMN google_docs_sync_status VARCHAR(50),
ADD COLUMN google_docs_synced_at TIMESTAMP,
ADD COLUMN google_docs_sync_error TEXT;

-- Add index for faster lookups by Google Docs ID
CREATE INDEX idx_documents_google_docs_id ON documents(google_docs_id) WHERE google_docs_id IS NOT NULL;

-- Add comment explaining the sync status values
COMMENT ON COLUMN documents.google_docs_sync_status IS 'Google Docs sync status: null | pending | synced | error';
