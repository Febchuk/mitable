-- Migration: Add structure-aware metadata for Notion chunking
-- Date: 2025-11-25
-- Description: Adds fields to support hierarchical, section-aware chunking of Notion documents

-- Add section hierarchy fields
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS section_path TEXT;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS section_title TEXT;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS section_id TEXT;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS heading_level INTEGER;

-- Add chunk classification fields
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS chunk_type TEXT;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS has_code BOOLEAN DEFAULT FALSE;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS has_table BOOLEAN DEFAULT FALSE;
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS has_list BOOLEAN DEFAULT FALSE;

-- Add code-specific metadata
ALTER TABLE search_content ADD COLUMN IF NOT EXISTS code_language TEXT;

-- Create indexes for fast filtering on new fields
CREATE INDEX IF NOT EXISTS search_content_section_idx ON search_content(section_id);
CREATE INDEX IF NOT EXISTS search_content_chunk_type_idx ON search_content(chunk_type);
CREATE INDEX IF NOT EXISTS search_content_has_code_idx ON search_content(has_code);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS search_content_org_chunk_type_idx ON search_content(organization_id, chunk_type);
CREATE INDEX IF NOT EXISTS search_content_page_chunk_type_idx ON search_content(page_id, chunk_type);

-- Add comments for documentation
COMMENT ON COLUMN search_content.section_path IS 'JSON array of section hierarchy: ["Parent", "Child", "Section"]';
COMMENT ON COLUMN search_content.section_title IS 'Title of the section this chunk belongs to';
COMMENT ON COLUMN search_content.section_id IS 'Unique identifier for the section';
COMMENT ON COLUMN search_content.heading_level IS 'Heading level (1, 2, 3) or NULL for non-heading sections';
COMMENT ON COLUMN search_content.chunk_type IS 'Type of chunk: code, table, list, text, callout, quote';
COMMENT ON COLUMN search_content.has_code IS 'Whether this chunk contains code blocks';
COMMENT ON COLUMN search_content.has_table IS 'Whether this chunk contains tables';
COMMENT ON COLUMN search_content.has_list IS 'Whether this chunk contains lists';
COMMENT ON COLUMN search_content.code_language IS 'Programming language if chunk_type=code: sql, typescript, python, etc.';
