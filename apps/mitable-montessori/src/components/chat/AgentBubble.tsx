"use client";

import * as React from "react";
import type { ResolvedEntity } from "@/lib/schemas/agent-chat";

export interface AgentBubbleMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  entities: ResolvedEntity[];
  pending?: boolean;
}

export function Bubble(props: { message: AgentBubbleMessage; onChipClick: (id: string) => void }) {
  const { message } = props;
  const isUser = message.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "82%",
        background: isUser ? "var(--color-clay-soft)" : "var(--color-canvas)",
        border: isUser ? "none" : "1px solid var(--color-border)",
        color: "var(--color-ink)",
        borderRadius: 14,
        borderBottomRightRadius: isUser ? 4 : 14,
        borderBottomLeftRadius: isUser ? 14 : 4,
        padding: "10px 12px",
        fontSize: 14,
        lineHeight: 1.45,
        opacity: message.pending ? 0.55 : 1,
      }}
    >
      <RichText text={message.text} entities={message.entities} onChipClick={props.onChipClick} />
    </div>
  );
}

export function RichText(props: {
  text: string;
  entities: ResolvedEntity[];
  onChipClick: (id: string) => void;
}) {
  // Build a flat list of [start, end, entityId | null] segments by walking
  // every entity offset and sorting. Render chip spans for entity matches,
  // text otherwise.
  const segments: Array<{ start: number; end: number; entityId: string | null }> = [];
  const flat: Array<{ start: number; end: number; entity: ResolvedEntity }> = [];
  for (const e of props.entities) {
    for (const [start, end] of e.offsets) {
      flat.push({ start, end, entity: e });
    }
  }
  flat.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const f of flat) {
    if (f.start < cursor) continue; // overlapping — skip
    if (f.start > cursor) {
      segments.push({ start: cursor, end: f.start, entityId: null });
    }
    segments.push({ start: f.start, end: f.end, entityId: f.entity.id });
    cursor = f.end;
  }
  if (cursor < props.text.length) {
    segments.push({ start: cursor, end: props.text.length, entityId: null });
  }

  return (
    <span>
      {segments.map((s, idx) => {
        const slice = props.text.slice(s.start, s.end);
        if (s.entityId) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => props.onChipClick(s.entityId!)}
              style={{
                background: "var(--color-terracotta-soft, rgba(196, 100, 60, 0.12))",
                color: "var(--color-terracotta-deep)",
                padding: "0 4px",
                borderRadius: 4,
                border: "none",
                fontWeight: 500,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {slice}
            </button>
          );
        }
        return <span key={idx}>{slice}</span>;
      })}
    </span>
  );
}
