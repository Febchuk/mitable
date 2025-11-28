-- Migration 0012: Add GitHub Code Domain metadata to search_content table
-- This enables storing and searching code chunks from GitHub repositories
-- Part of Phase 1: Code Domain (functions, classes, files)

-- Add GitHub-specific columns to search_content
ALTER TABLE search_content 
ADD COLUMN IF NOT EXISTS repo_id TEXT,
ADD COLUMN IF NOT EXISTS repo_full_name TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS language TEXT,
ADD COLUMN IF NOT EXISTS file_role TEXT,
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS commit_sha TEXT,
ADD COLUMN IF NOT EXISTS git_author TEXT,
ADD COLUMN IF NOT EXISTS committed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS start_line INTEGER,
ADD COLUMN IF NOT EXISTS end_line INTEGER,
ADD COLUMN IF NOT EXISTS function_name TEXT,
ADD COLUMN IF NOT EXISTS class_name TEXT,
ADD COLUMN IF NOT EXISTS exports TEXT[],
ADD COLUMN IF NOT EXISTS is_exported BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_test_file BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_generated BOOLEAN DEFAULT FALSE;

-- Create indexes for efficient filtering of GitHub code chunks
CREATE INDEX IF NOT EXISTS search_content_repo_idx ON search_content(repo_full_name);
CREATE INDEX IF NOT EXISTS search_content_file_role_idx ON search_content(file_role);
CREATE INDEX IF NOT EXISTS search_content_area_idx ON search_content(area);
CREATE INDEX IF NOT EXISTS search_content_language_idx ON search_content(language);

-- Create composite index for common GitHub queries
CREATE INDEX IF NOT EXISTS search_content_repo_file_idx ON search_content(repo_full_name, file_path);

-- Comments for documentation
COMMENT ON COLUMN search_content.repo_id IS 'Foreign key reference to github_repos table (not enforced)';
COMMENT ON COLUMN search_content.repo_full_name IS 'Full repository name in format: owner/repo (e.g., Febchuk/mitable)';
COMMENT ON COLUMN search_content.file_path IS 'Relative path from repo root (e.g., apps/backend/src/services/notion.service.ts)';
COMMENT ON COLUMN search_content.file_name IS 'Just the filename (e.g., notion.service.ts)';
COMMENT ON COLUMN search_content.language IS 'Programming language (typescript, javascript, python, etc.)';
COMMENT ON COLUMN search_content.file_role IS 'Auto-detected role: service, controller, component, schema, config, test, util, migration';
COMMENT ON COLUMN search_content.area IS 'Code area: backend-services, electron-main, frontend-ui, etc.';
COMMENT ON COLUMN search_content.commit_sha IS 'Git commit SHA where this code was indexed';
COMMENT ON COLUMN search_content.git_author IS 'Git commit author name';
COMMENT ON COLUMN search_content.committed_at IS 'When the code was committed';
COMMENT ON COLUMN search_content.start_line IS 'Start line number of the symbol/function/class';
COMMENT ON COLUMN search_content.end_line IS 'End line number of the symbol/function/class';
COMMENT ON COLUMN search_content.function_name IS 'Function name for function chunks';
COMMENT ON COLUMN search_content.class_name IS 'Class name for class/method chunks';
COMMENT ON COLUMN search_content.exports IS 'Array of exported symbol names (for file_overview chunks)';
COMMENT ON COLUMN search_content.is_exported IS 'Whether this symbol is exported (public API)';
COMMENT ON COLUMN search_content.is_test_file IS 'Whether this is a test file (for filtering)';
COMMENT ON COLUMN search_content.is_generated IS 'Whether this is generated code (Prisma client, etc.)';
