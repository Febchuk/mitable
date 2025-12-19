-- Migration: Add Documentation/Knowledge Base Tables
-- Purpose: Support in-app knowledge base with session-based doc generation and Notion export

-- Knowledge Base Documents
CREATE TABLE IF NOT EXISTS "documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,

    -- Document metadata
    "title" varchar(500) NOT NULL,
    "doc_type" varchar(50) NOT NULL, -- 'how-to' | 'knowledge-article' | 'troubleshooting'
    "status" varchar(50) NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'archived'
    "description" text,
    "tags" jsonb DEFAULT '[]'::jsonb,

    -- Content (markdown)
    "content" text NOT NULL,

    -- Notion sync tracking
    "notion_page_id" varchar(36),
    "notion_sync_status" varchar(50), -- 'pending' | 'synced' | 'error' | null
    "notion_synced_at" timestamp,
    "notion_sync_error" text,

    -- AI generation metadata
    "generation_model" varchar(100),
    "generation_prompt_version" integer DEFAULT 1,

    -- Timestamps
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "published_at" timestamp
);

-- Document Versions (track edit history)
CREATE TABLE IF NOT EXISTS "document_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,

    "version" integer NOT NULL,
    "content" text NOT NULL,
    "change_summary" text,
    "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "change_type" varchar(50) NOT NULL, -- 'created' | 'user_edit' | 'ai_revision' | 'session_update'

    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Session-Document Contributions (which sessions contributed to a doc)
CREATE TABLE IF NOT EXISTS "session_document_contributions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL REFERENCES "monitoring_sessions"("id") ON DELETE CASCADE,
    "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,

    "contribution_type" varchar(50) NOT NULL, -- 'source' | 'update' | 'enhancement'
    "insights_used" jsonb DEFAULT '[]'::jsonb,

    "created_at" timestamp DEFAULT now() NOT NULL,

    UNIQUE("session_id", "document_id")
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_documents_org" ON "documents" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_documents_type" ON "documents" ("doc_type");
CREATE INDEX IF NOT EXISTS "idx_documents_status" ON "documents" ("status");
CREATE INDEX IF NOT EXISTS "idx_documents_org_type" ON "documents" ("organization_id", "doc_type");
CREATE INDEX IF NOT EXISTS "idx_documents_created_by" ON "documents" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_document_versions_doc" ON "document_versions" ("document_id", "version");
CREATE INDEX IF NOT EXISTS "idx_session_doc_contributions_session" ON "session_document_contributions" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_session_doc_contributions_doc" ON "session_document_contributions" ("document_id");

-- Full-text search for document content
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "content_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS "idx_documents_fts" ON "documents" USING GIN ("content_vector");
