-- Migration: Add session_chunks table for document generation RAG
-- This table stores chunked and embedded session data (classifier + storyteller)
-- Completely separate from search_content (knowledge agent domain)

CREATE TABLE IF NOT EXISTS session_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Chunk metadata
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('classifier', 'storyteller_summary', 'storyteller_timeline')),
  
  -- Content and embedding
  text TEXT NOT NULL,
  embedding vector(1536),
  
  -- Contextual metadata (entities, timestamps, activity info)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one chunk per (session, type, index)
  CONSTRAINT unique_session_chunk UNIQUE (session_id, chunk_type, chunk_index)
);

-- Indexes for fast retrieval
CREATE INDEX idx_session_chunks_session_id ON session_chunks(session_id);
CREATE INDEX idx_session_chunks_org_id ON session_chunks(organization_id);
CREATE INDEX idx_session_chunks_type ON session_chunks(chunk_type);

-- HNSW index for vector similarity search (cosine distance)
CREATE INDEX idx_session_chunks_embedding ON session_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for metadata queries (entities, timestamps)
CREATE INDEX idx_session_chunks_metadata ON session_chunks USING GIN(metadata);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_session_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_session_chunks_updated_at
  BEFORE UPDATE ON session_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_session_chunks_updated_at();
