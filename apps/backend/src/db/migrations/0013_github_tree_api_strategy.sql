-- Migration 0013: GitHub Tree API Strategy (Dual-Domain)
-- Date: 2025-11-27
--
-- Changes:
-- 1. Add last_indexed_commit_sha to github_repos (tracks HEAD SHA for code snapshots)
-- 2. Remove content from github_commit_files (Work domain = metadata only)
--
-- Rationale:
-- - Code domain: Tree API snapshot (current state only, not historical versions)
-- - Work domain: Commit/PR/issue metadata only (paths + stats, no file contents)
-- - Prevents "be GitHub" storage explosion from storing every file version

-- Add tracking field for code snapshot state
ALTER TABLE github_repos 
ADD COLUMN IF NOT EXISTS last_indexed_commit_sha VARCHAR(100);

COMMENT ON COLUMN github_repos.last_indexed_commit_sha IS 'Tracks which commit SHA has been indexed for code snapshot (Tree API strategy)';

-- Remove file content storage from commit files
-- Work domain only needs metadata (path, status, additions/deletions)
-- Code domain uses Tree API to fetch current snapshot directly
ALTER TABLE github_commit_files 
DROP COLUMN IF EXISTS content;

-- Add comment to clarify the dual-domain strategy
COMMENT ON TABLE github_commit_files IS 'Work domain: stores file metadata from commits (path, status, stats). Code content fetched via Tree API snapshot service.';
