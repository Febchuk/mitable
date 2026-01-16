-- Migration: Add Key Activities Table (Activity Registry)
-- Part of the Relational State-Anchor Refactor
--
-- This migration creates the key_activities table which serves as the
-- source of truth for tracking distinct work activities within a session.
-- It also adds new columns to session_captures for linking to key activities
-- and storing the enhanced Perceiver output (milestones, progress state, etc.)
--
-- NOTE: Resumption detection uses behavioral/semantic matching via Master Story
-- + sliding timeline (last 15-20 entries) rather than visual anchors. This is
-- more accurate because the same app/page can be used for multiple activities.

-- ============================================================================
-- 1. Create key_activities table (Activity Registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "key_activities" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL REFERENCES "monitoring_sessions"("id") ON DELETE CASCADE,
    
    -- Activity identification
    "key_activity_name" varchar(255) NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
    -- Values: 'IN_PROGRESS' | 'COMPLETE'
    
    -- Timing
    "first_seen_at" timestamp DEFAULT now() NOT NULL,
    "last_seen_at" timestamp DEFAULT now() NOT NULL,
    "completed_at" timestamp,
    
    -- Interval tracking for materiality filtering
    "consecutive_intervals" integer NOT NULL DEFAULT 1,
    "total_intervals" integer NOT NULL DEFAULT 1,
    
    -- Milestone tracking
    "milestone_count" integer NOT NULL DEFAULT 0,
    "last_milestone_at" timestamp,
    "last_milestone_description" text,
    
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for key_activities
CREATE INDEX IF NOT EXISTS "idx_key_activities_session" ON "key_activities" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_key_activities_status" ON "key_activities" ("session_id", "status");

-- ============================================================================
-- 2. Add new columns to session_captures for Perceiver output
-- ============================================================================

-- Link to key activity (nullable - null during CONTEXT_SWITCH or before activity established)
ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "key_activity_id" uuid REFERENCES "key_activities"("id") ON DELETE SET NULL;

-- Progress state from Perceiver
ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "progress" varchar(20);
-- Values: 'IN_PROGRESS' | 'COMPLETE' | 'CONTEXT_SWITCH'

-- Structural break detection (triggers new visual anchor)
ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "structural_break_detected" boolean DEFAULT false;

-- Milestone detection
ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "milestone_detected" boolean DEFAULT false;

ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "milestone_description" text;

ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "milestone_confidence" varchar(10);
-- Values: 'high' | 'medium' | 'low'

ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "milestone_inferred_from" varchar(30);
-- Values: 'state_transition' | 'cumulative_pattern' | 'content_change'

-- Evidence reference (what visual element determined the progress status)
ALTER TABLE "session_captures" 
ADD COLUMN IF NOT EXISTS "evidence_reference" text;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS "idx_captures_key_activity" ON "session_captures" ("key_activity_id");
CREATE INDEX IF NOT EXISTS "idx_captures_milestone" ON "session_captures" ("session_id", "milestone_detected");

-- ============================================================================
-- 3. Comments for documentation
-- ============================================================================

COMMENT ON TABLE "key_activities" IS 
'Activity Registry - Source of truth for tracking distinct work activities within a session. Enables the "Database of Work" concept where activities are perfectly queryable. Resumption detection uses behavioral/semantic matching via Master Story + sliding timeline.';

COMMENT ON COLUMN "key_activities"."consecutive_intervals" IS 
'Number of consecutive intervals on this activity. Used for materiality filtering (3+ = update Master Story)';

COMMENT ON COLUMN "key_activities"."milestone_count" IS 
'Count of detected milestones for this activity. Milestones trigger Master Story updates.';

COMMENT ON COLUMN "session_captures"."progress" IS 
'Progress state from Perceiver: IN_PROGRESS (working on task), COMPLETE (success marker visible), CONTEXT_SWITCH (doing unrelated work)';

COMMENT ON COLUMN "session_captures"."structural_break_detected" IS 
'True when user moved to a fundamentally different visual domain (app switch, domain switch in browser)';

COMMENT ON COLUMN "session_captures"."milestone_detected" IS 
'True when a meaningful progress checkpoint was inferred from state transition';
