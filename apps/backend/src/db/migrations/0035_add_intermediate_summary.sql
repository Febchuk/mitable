-- Add intermediate summary fields to monitoring_sessions table
-- These fields enable real-time intermediate summaries during active sessions

ALTER TABLE "monitoring_sessions" ADD COLUMN IF NOT EXISTS "intermediate_summary_interval_ms" integer NOT NULL DEFAULT 1800000;
ALTER TABLE "monitoring_sessions" ADD COLUMN IF NOT EXISTS "intermediate_summary_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "monitoring_sessions" ADD COLUMN IF NOT EXISTS "last_intermediate_summary_at" timestamp;
ALTER TABLE "monitoring_sessions" ADD COLUMN IF NOT EXISTS "intermediate_summary" text;
ALTER TABLE "monitoring_sessions" ADD COLUMN IF NOT EXISTS "intermediate_summary_status" varchar(50);
