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
  if (kind === "chips") {
    const chipsRaw = Array.isArray(payload.chips) ? payload.chips : [];
    return {
      kind: "chips",
      body: String(payload.body ?? ""),
      chips: chipsRaw.map((c, i) => {
        const cc = c as { id?: string; label?: string; prefill?: string };
        return {
          id: cc?.id ?? `c-${i}`,
          label: String(cc?.label ?? ""),
          prefill: String(cc?.prefill ?? ""),
        };
      }),
      ...base,
    };
  }
  if (kind === "obs-ref") {
    const obs = payload.obs as
      | {
          artifactId?: string;
          quote?: string;
          when?: string;
          area?: string;
          source?: "photo" | "transcript" | "ocr";
        }
      | undefined;
    const suggested = payload.suggestedTarget as
      | { sectionId?: string; position?: "append" | "after" | "new-paragraph" }
      | undefined;
    return {
      kind: "obs-ref",
      body: String(payload.body ?? ""),
      obs: {
        artifactId: obs?.artifactId ?? "",
        quote: obs?.quote ?? "",
        when: obs?.when ?? "",
        ...(obs?.area ? { area: obs.area } : {}),
        ...(obs?.source ? { source: obs.source } : {}),
      },
      ...(suggested?.sectionId
        ? {
            suggestedTarget: {
              sectionId: suggested.sectionId,
              position: suggested.position ?? "append",
            },
          }
        : {}),
      ...base,
    };
  }
  if (kind === "ghost-edit") {
    const target = payload.target as { sectionId?: string } | undefined;
    const ghost = payload.ghostEdit as
      | { id?: string; html?: string; sourceLabel?: string }
      | undefined;
    return {
      kind: "ghost-edit",
      body: String(payload.body ?? ""),
      target: { sectionId: target?.sectionId ?? "" },
      ghostEdit: {
        id: ghost?.id ?? row.id,
        html: ghost?.html ?? "",
        sourceLabel: ghost?.sourceLabel ?? "",
      },
      ...base,
    };
  }
  if (kind === "new-section") {
    const paragraphsRaw = Array.isArray(payload.paragraphs) ? payload.paragraphs : [];
    const paragraphs = paragraphsRaw.map((p, i) => {
      const pp = p as { id?: string; html?: string };
      return {
        id: pp?.id ?? `p-${row.id}-${i}`,
        html: String(pp?.html ?? ""),
      };
    });
    return {
      kind: "new-section",
      body: String(payload.body ?? ""),
      sectionId: String(payload.sectionId ?? row.id),
      heading: String(payload.heading ?? ""),
      paragraphs,
      ...(typeof payload.afterSectionId === "string"
        ? { afterSectionId: payload.afterSectionId }
        : {}),
      ...base,
    };
  }
  return {
    kind: kind as "prose" | "clarify" | "user-text",
    body: String(payload.body ?? ""),
    ...base,
  };
}
