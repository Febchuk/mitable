CREATE TABLE IF NOT EXISTS "document_refinement_chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_doc_refinement_chats_doc_user" ON "document_refinement_chats" ("document_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_doc_refinement_chats_doc" ON "document_refinement_chats" ("document_id");
