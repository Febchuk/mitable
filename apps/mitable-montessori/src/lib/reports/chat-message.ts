import type { ChatTurnMessage } from "@/lib/schemas/report-chat";

/**
 * Shared row → ChatTurnMessage mapping for the chat endpoints. Persisted
 * payloads are detokenized JSONB; this function pulls the right shape per
 * `kind` so the wire format stays a clean discriminated union.
 */
export type StoredChatRow = {
  id: string;
  role: string;
  kind: string;
  payload: Record<string, unknown> | null;
  target_ref: unknown;
  actor_role: "teacher" | "admin" | "assistant";
  applied_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export function rowToChatMessage(row: StoredChatRow): ChatTurnMessage {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const kind = row.kind as ChatTurnMessage["kind"];
  const base = {
    id: row.id,
    createdAt: row.created_at,
    actorRole: row.actor_role,
    targetRef: (row.target_ref as ChatTurnMessage["targetRef"]) ?? undefined,
    appliedAt: row.applied_at ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
  };
  if (kind === "proposal") {
    const target = payload.target as
      | { sectionId?: string; paragraphId?: string; headingDisplay?: string }
      | undefined;
    return {
      kind: "proposal",
      lead: String(payload.lead ?? ""),
      target: {
        sectionId: target?.sectionId ?? "",
        paragraphId: target?.paragraphId ?? "",
        ...(target?.headingDisplay ? { headingDisplay: target.headingDisplay } : {}),
      },
      oldText: String(payload.oldText ?? ""),
      newText: String(payload.newText ?? ""),
      ...(typeof payload.rationale === "string" ? { rationale: payload.rationale } : {}),
      ...base,
    };
  }
  return {
    kind: kind as "prose" | "clarify" | "user-text",
    body: String(payload.body ?? ""),
    ...base,
  };
}
