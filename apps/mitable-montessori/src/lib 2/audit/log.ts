import { createAdminClient } from "@/utils/supabase/admin";

export interface AuditLogParams {
  actor_id: string | null;
  actor_role: "admin" | "teacher" | "system" | "guardian";
  action: string;
  target_table?: string;
  target_id?: string;
  /** Natural-language input that triggered the action — only safe for tokenized strings. */
  prompt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Server-side audit trail. Never include plaintext PII in `prompt` or `metadata`;
 * audit rows are admin-readable.
 */
export async function auditLog(params: AuditLogParams) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: params.actor_id,
    actor_role: params.actor_role,
    action: params.action,
    target_table: params.target_table ?? null,
    target_id: params.target_id ?? null,
    prompt: params.prompt ?? null,
    metadata: params.metadata ?? null,
  });
  if (error) {
    console.error("audit_log insert failed", error);
  }
}
