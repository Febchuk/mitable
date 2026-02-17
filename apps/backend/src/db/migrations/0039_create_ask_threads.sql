CREATE TABLE IF NOT EXISTS "ask_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization_id" varchar(255) NOT NULL,
  "title" varchar(255) DEFAULT 'New conversation',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ask_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "ask_threads"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL,
  "content" text NOT NULL,
  "report_title" varchar(255),
  "report_subtitle" varchar(255),
  "report_html" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ask_threads_user_id_idx" ON "ask_threads" ("user_id");
CREATE INDEX IF NOT EXISTS "ask_threads_org_id_idx" ON "ask_threads" ("organization_id");
CREATE INDEX IF NOT EXISTS "ask_messages_thread_id_idx" ON "ask_messages" ("thread_id");
