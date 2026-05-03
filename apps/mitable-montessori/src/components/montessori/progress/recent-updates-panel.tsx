"use client";

import * as React from "react";
import {
  CHILDREN,
  STATUS_COLOR,
  STATUS_LABEL,
  type RecentUpdateEntry,
} from "@/components/montessori/data";
import { Avatar } from "@/components/montessori/primitives";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

type RecentUpdatesPanelProps = {
  entries: RecentUpdateEntry[];
};

export function RecentUpdatesPanel({ entries }: RecentUpdatesPanelProps) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: "18px 16px", color: "var(--color-ink-muted)", fontSize: 12.5 }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
          Today
        </div>
        No updates yet. Select cells in the grid to record a lesson.
      </div>
    );
  }
  return (
    <div>
      <div style={{ padding: "16px 16px 8px" }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          Recent updates
        </div>
      </div>
      {entries.slice(0, 24).map((e) => {
        const child = CHILDREN.find((c) => c.id === e.childId);
        if (!child) return null;
        return (
          <div
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              gap: 10,
              padding: "10px 14px",
              borderBottom: "1px solid var(--color-border)",
              alignItems: "flex-start",
            }}
          >
            <Avatar initials={initialsFor(child.name)} tone={child.tone} size={26} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>
                {child.name.split(" ")[0]}{" "}
                <span style={{ color: "var(--color-ink-muted)", fontWeight: 400 }}>·</span>{" "}
                <span style={{ color: "var(--color-ink-secondary)", fontWeight: 400 }}>
                  {e.subtopicName}
                </span>
                <span
                  style={{
                    color: "var(--color-ink-muted)",
                    fontWeight: 400,
                    fontSize: 10.5,
                    marginLeft: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {e.topic}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  fontSize: 11.5,
                  color: "var(--color-ink-muted)",
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: e.status === "-" ? "transparent" : STATUS_COLOR[e.status],
                    border:
                      e.status === "-" ? "1px dashed var(--color-border)" : "1px solid transparent",
                    display: "inline-block",
                  }}
                />
                <span>
                  {STATUS_LABEL[e.status]} · {e.when}
                </span>
              </div>
              {e.noteText && (
                <div
                  className="font-display"
                  style={{
                    marginTop: 6,
                    fontSize: 17,
                    color: "var(--color-ink)",
                    lineHeight: 1.25,
                  }}
                >
                  &ldquo;{e.noteText}&rdquo;
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
