-- Migration: Add Artifacts Tables
-- Purpose: Support file upload artifacts (PDFs, DOCX, images) for document generation

-- ============================================
-- Table: artifacts
-- ============================================
CREATE TABLE IF NOT EXISTS "artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

  -- File metadata
  "filename" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,

  -- Storage
  "storage_url" text NOT NULL,
  "storage_key" varchar(500) NOT NULL,

  -- File info
  "file_size_bytes" integer NOT NULL,

  -- Text extraction
  "extracted_text" text,
  "extraction_status" varchar(50) NOT NULL DEFAULT 'pending',
  "extraction_error" text,

  -- Embedding for RAG
  "embedding_status" varchar(50) DEFAULT 'pending',
  "embedding_error" text,
  "pinecone_ids" jsonb DEFAULT '[]'::jsonb,

  -- Extensible metadata
  "metadata" jsonb DEFAULT '{}'::jsonb,

  -- Timestamps
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for artifacts
CREATE INDEX IF NOT EXISTS "idx_artifacts_org" ON "artifacts" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_artifacts_uploaded_by" ON "artifacts" ("uploaded_by");
CREATE INDEX IF NOT EXISTS "idx_artifacts_extraction_status" ON "artifacts" ("extraction_status");
CREATE INDEX IF NOT EXISTS "idx_artifacts_embedding_status" ON "artifacts" ("embedding_status");

-- ============================================
-- Table: document_artifact_sources
-- ============================================
CREATE TABLE IF NOT EXISTS "document_artifact_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "artifact_id" uuid NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,

  "contribution_type" varchar(50) NOT NULL DEFAULT 'source',

  "created_at" timestamp DEFAULT now() NOT NULL,

  UNIQUE("document_id", "artifact_id")
);

-- Indexes for document_artifact_sources
CREATE INDEX IF NOT EXISTS "idx_doc_artifact_sources_doc" ON "document_artifact_sources" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_doc_artifact_sources_artifact" ON "document_artifact_sources" ("artifact_id");

-- Trigger for updated_at on artifacts
CREATE OR REPLACE FUNCTION update_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artifacts_updated_at_trigger
  BEFORE UPDATE ON "artifacts"
  FOR EACH ROW
  EXECUTE FUNCTION update_artifacts_updated_at();
