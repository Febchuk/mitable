-- Migration: Add artifacts table
-- Stores user-uploaded files or pasted text to be used as context for document generation

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Artifact metadata
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'file' | 'text'
  
  -- File specific
  url VARCHAR(1000), -- URL from UploadThing (for files)
  file_type VARCHAR(100), -- e.g. 'application/pdf', 'text/plain'
  size BIGINT, -- Size in bytes
  
  -- Text specific
  content TEXT, -- Raw text content (for pasted text)
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active' | 'archived'
  
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS artifacts_organization_id_idx ON artifacts(organization_id);
CREATE INDEX IF NOT EXISTS artifacts_user_id_idx ON artifacts(user_id);
CREATE INDEX IF NOT EXISTS artifacts_type_idx ON artifacts(type);
CREATE INDEX IF NOT EXISTS artifacts_status_idx ON artifacts(status);

-- Add comments for documentation
COMMENT ON TABLE artifacts IS 'User-uploaded knowledge sources (files or text) for document generation context';
COMMENT ON COLUMN artifacts.type IS 'Type of artifact: file (uploaded via UploadThing) or text (pasted content)';
COMMENT ON COLUMN artifacts.url IS 'UploadThing URL for file artifacts';
COMMENT ON COLUMN artifacts.content IS 'Raw text content for text artifacts';
COMMENT ON COLUMN artifacts.status IS 'Status: active (available) or archived (hidden)';

