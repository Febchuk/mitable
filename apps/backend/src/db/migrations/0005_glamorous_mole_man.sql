-- Add workflow relationship fields to messages table
ALTER TABLE "messages" ADD COLUMN "workflow_session_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "related_step_index" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workflow_session_id_workflow_sessions_id_fk" FOREIGN KEY ("workflow_session_id") REFERENCES "public"."workflow_sessions"("id") ON DELETE set null ON UPDATE no action;