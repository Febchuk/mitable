-- Add monitoring session tables for work session tracking

-- Monitoring Sessions - Core session tracking
CREATE TABLE IF NOT EXISTS "monitoring_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" varchar(255),
    "status" varchar(50) DEFAULT 'active' NOT NULL,
    "capture_interval_ms" integer DEFAULT 30000 NOT NULL,
    "selected_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "started_at" timestamp DEFAULT now() NOT NULL,
    "paused_at" timestamp,
    "total_paused_ms" integer DEFAULT 0 NOT NULL,
    "ended_at" timestamp,
    "raw_activity_summary" text,
    "final_summary" text,
    "key_activities" jsonb DEFAULT '[]'::jsonb,
    "accomplishments" jsonb DEFAULT '[]'::jsonb,
    "blockers" jsonb DEFAULT '[]'::jsonb,
    "time_breakdown" jsonb,
    "delivery_status" varchar(50),
    "delivery_channel" varchar(50),
    "delivery_target" jsonb,
    "delivered_at" timestamp,
    "delivery_error" text,
    "slack_message_ts" varchar(50),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Session Captures - Screenshot timeline
CREATE TABLE IF NOT EXISTS "session_captures" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL REFERENCES "monitoring_sessions"("id") ON DELETE CASCADE,
    "sequence_number" integer NOT NULL,
    "capture_trigger" varchar(50) NOT NULL,
    "captured_at" timestamp DEFAULT now() NOT NULL,
    "window_id" varchar(255),
    "app_name" varchar(255),
    "window_title" text,
    "screenshot_path" text,
    "screenshot_hash" varchar(64),
    "thumbnail_data" text,
    "analysis_status" varchar(50) DEFAULT 'pending',
    "activity_description" text,
    "confidence" numeric(3, 2),
    "detected_elements" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Session Summaries - Versioned summaries
CREATE TABLE IF NOT EXISTS "session_summaries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL REFERENCES "monitoring_sessions"("id") ON DELETE CASCADE,
    "version" integer DEFAULT 1 NOT NULL,
    "summary_type" varchar(50) NOT NULL,
    "narrative_summary" text NOT NULL,
    "activities" jsonb DEFAULT '[]'::jsonb,
    "time_breakdown" jsonb,
    "model_used" varchar(100),
    "token_count" integer,
    "generation_time_ms" integer,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_monitoring_sessions_user" ON "monitoring_sessions" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_monitoring_sessions_org" ON "monitoring_sessions" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_session_captures_session" ON "session_captures" ("session_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "idx_session_captures_hash" ON "session_captures" ("screenshot_hash");
CREATE INDEX IF NOT EXISTS "idx_session_summaries_session" ON "session_summaries" ("session_id", "version");
