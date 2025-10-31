-- ============================================================================
-- Workflow Tables Migration
-- ============================================================================
-- Purpose: Isolate UI guidance workflows from regular chat messages
-- 
-- Key Features:
-- 1. Workflows stored separately from messages table
-- 2. Linked to BOTH conversation (context) and user (history)
-- 3. AI can recall past workflows across different chats
-- 4. Full-text search on summaries for semantic recall
--
-- Example AI usage:
-- User (in new chat): "How do I update Slack again?"
-- AI: "I showed you this on Oct 15th in another conversation. Let me pull up
--      that workflow... [retrieves workflow_sessions by user_id]"
-- ============================================================================

-- Create workflow_sessions table
-- Stores UI guidance workflows separately from regular chat messages
-- Hierarchy: organization → user → conversation → workflow
--
-- Workflow Lifecycle:
-- 1. User asks question → AI proposes workflow → status: (not created yet)
-- 2. User confirms "Yes" → Workflow created → status: 'active', completed_at: NULL
-- 3. User progresses through steps → status: 'active', current_step_index updates
-- 4a. User completes all steps → status: 'completed', completion_type: 'success', completed_at: NOW()
-- 4b. User clicks exit → status: 'cancelled', completion_type: 'user_cancelled', completed_at: NOW()
-- 5. User can now minimize accordion and return to normal chat
--
-- IMPORTANT: User must explicitly complete or cancel - no automatic termination
CREATE TABLE IF NOT EXISTS "workflow_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"solution" text NOT NULL,
	"solution_explanation" text NOT NULL,
	"search_query" text NOT NULL,
	"summary" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"completion_type" varchar(50),
	"workflow_data" jsonb NOT NULL,
	"steps_modified" integer DEFAULT 0 NOT NULL,
	"last_step_modified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_sessions_status_check" CHECK ("status" IN ('active', 'completed', 'cancelled')),
	CONSTRAINT "workflow_sessions_completion_check" CHECK (
		("status" = 'active' AND "completed_at" IS NULL) OR
		("status" IN ('completed', 'cancelled') AND "completed_at" IS NOT NULL)
	)
);

-- Create workflow_interactions table
-- Captures ALL conversation that happens INSIDE the workflow accordion
-- Including: step progress, user questions, AI responses, step modifications
-- This is separate from the main chat messages table
CREATE TABLE IF NOT EXISTS "workflow_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_session_id" uuid NOT NULL REFERENCES "workflow_sessions"("id") ON DELETE cascade,
	"type" varchar(50) NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text,
	"related_step_index" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_interactions_type_check" CHECK ("type" IN (
		'step_progress',
		'user_question',
		'ai_response',
		'step_modified',
		'workflow_complete',
		'workflow_cancelled'
	)),
	CONSTRAINT "workflow_interactions_role_check" CHECK ("role" IN ('user', 'assistant', 'system'))
);

-- Create indexes for performance and AI recall queries
-- Index for organization-level isolation (ensure data stays within org)
CREATE INDEX IF NOT EXISTS "workflow_sessions_org_idx" ON "workflow_sessions"("organization_id");

-- Index for querying workflows by conversation
CREATE INDEX IF NOT EXISTS "workflow_sessions_conversation_idx" ON "workflow_sessions"("conversation_id");

-- Index for querying all workflows for a specific user (cross-chat recall)
CREATE INDEX IF NOT EXISTS "workflow_sessions_user_idx" ON "workflow_sessions"("user_id");

-- Composite index for querying user's recent workflows within their org
CREATE INDEX IF NOT EXISTS "workflow_sessions_org_user_created_idx" ON "workflow_sessions"("organization_id", "user_id", "created_at" DESC);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS "workflow_sessions_status_idx" ON "workflow_sessions"("status");

-- Index for workflow interactions
CREATE INDEX IF NOT EXISTS "workflow_interactions_session_idx" ON "workflow_interactions"("workflow_session_id");
CREATE INDEX IF NOT EXISTS "workflow_interactions_created_idx" ON "workflow_interactions"("created_at");
CREATE INDEX IF NOT EXISTS "workflow_interactions_type_idx" ON "workflow_interactions"("type");

-- Composite index for querying interactions by step (e.g., "show me all questions for step 3")
CREATE INDEX IF NOT EXISTS "workflow_interactions_session_step_idx" ON "workflow_interactions"("workflow_session_id", "related_step_index");

-- Full text search index on summary for AI semantic search
CREATE INDEX IF NOT EXISTS "workflow_sessions_summary_idx" ON "workflow_sessions" USING gin(to_tsvector('english', COALESCE("summary", '')));

-- ============================================================================
-- Example Usage Flow
-- ============================================================================
--
-- 1. USER STARTS WORKFLOW:
--    INSERT INTO workflow_sessions (organization_id, user_id, conversation_id, ...)
--    VALUES (..., status='active', current_step_index=0, ...)
--
-- 2. USER PROGRESSES STEP:
--    INSERT INTO workflow_interactions (workflow_session_id, type, role, ...)
--    VALUES (..., 'step_progress', 'user', ...)
--    UPDATE workflow_sessions SET current_step_index = 1 WHERE id = ...
--
-- 3. USER ASKS QUESTION DURING STEP 2:
--    INSERT INTO workflow_interactions (type, role, content, related_step_index)
--    VALUES ('user_question', 'user', 'How do I access that menu?', 2)
--
-- 4. AI RESPONDS AND MODIFIES STEP:
--    INSERT INTO workflow_interactions (type, role, content, related_step_index)
--    VALUES ('ai_response', 'assistant', 'Let me clarify that step...', 2)
--    
--    INSERT INTO workflow_interactions (type, role, metadata, related_step_index)
--    VALUES ('step_modified', 'system', '{"previous": "...", "new": "..."}', 2)
--    
--    UPDATE workflow_sessions SET 
--      workflow_data = '{"stepList": [...updated steps...]}',
--      steps_modified = steps_modified + 1,
--      last_step_modified_at = NOW(),
--      updated_at = NOW()
--    WHERE id = ...
--
-- 5. USER COMPLETES WORKFLOW:
--    INSERT INTO workflow_interactions (type, role)
--    VALUES ('workflow_complete', 'system')
--    
--    UPDATE workflow_sessions SET 
--      status = 'completed',
--      completion_type = 'success',
--      completed_at = NOW()
--    WHERE id = ...
--
-- ============================================================================
