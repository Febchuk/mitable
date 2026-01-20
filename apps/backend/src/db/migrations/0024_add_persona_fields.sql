-- Migration 0024: Add persona fields to users table
-- Adds columns for user persona/profile information:
-- - job_title: User's job title/role
-- - regular_tasks: Array of regular tasks (JSONB)
-- - regular_apps: Array of regular apps (JSONB)
-- - additional_context: Free-text additional context

-- Add job_title column
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);

-- Add regular_tasks column (JSONB array)
ALTER TABLE users ADD COLUMN IF NOT EXISTS regular_tasks JSONB DEFAULT '[]'::jsonb;

-- Add regular_apps column (JSONB array)
ALTER TABLE users ADD COLUMN IF NOT EXISTS regular_apps JSONB DEFAULT '[]'::jsonb;

-- Add additional_context column
ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_context TEXT;

-- Add column comments for documentation
COMMENT ON COLUMN users.job_title IS 'User job title or role (e.g., Software Engineer, Designer)';
COMMENT ON COLUMN users.regular_tasks IS 'Array of regular tasks the user performs (JSONB array of strings)';
COMMENT ON COLUMN users.regular_apps IS 'Array of regular apps the user uses (JSONB array of strings)';
COMMENT ON COLUMN users.additional_context IS 'Free-text additional context about the user';
