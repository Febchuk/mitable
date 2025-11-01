CREATE TABLE "workflow_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_session_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text,
	"related_step_index" integer,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_content" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_type" text,
	"text" text NOT NULL,
	"text_vector" "tsvector" NOT NULL,
	"channel_id" text,
	"channel_name" text,
	"user_id" text,
	"username" text,
	"page_id" text,
	"page_title" text,
	"block_id" text,
	"block_type" text,
	"chunk_index" integer DEFAULT 0,
	"total_chunks" integer DEFAULT 1,
	"is_chunked" boolean DEFAULT false,
	"timestamp" bigint,
	"date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_interactions" ADD CONSTRAINT "workflow_interactions_workflow_session_id_workflow_sessions_id_fk" FOREIGN KEY ("workflow_session_id") REFERENCES "public"."workflow_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_sessions" ADD CONSTRAINT "workflow_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_sessions" ADD CONSTRAINT "workflow_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_sessions" ADD CONSTRAINT "workflow_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_content" ADD CONSTRAINT "search_content_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_content_text_vector_idx" ON "search_content" USING gin ("text_vector");--> statement-breakpoint
CREATE INDEX "search_content_org_idx" ON "search_content" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "search_content_source_idx" ON "search_content" USING btree ("source");--> statement-breakpoint
CREATE INDEX "search_content_date_idx" ON "search_content" USING btree ("date");--> statement-breakpoint
CREATE INDEX "search_content_org_source_idx" ON "search_content" USING btree ("organization_id","source");--> statement-breakpoint
CREATE INDEX "search_content_org_date_idx" ON "search_content" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "search_content_channel_idx" ON "search_content" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "search_content_page_idx" ON "search_content" USING btree ("page_id");