"use client";

import * as React from "react";
import { STATUS_COLOR, STATUS_LABEL, type RecentUpdateEntry } from "@/components/montessori/data";
import { Avatar } from "@/components/montessori/primitives";
import type { ClassroomProgressStudent } from "@/lib/queries/classroom-progress";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

const TONES = ["clay", "sage", "butter", "blue", "terracotta"] as const;
function toneFor(id: string): (typeof TONES)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

type RecentUpdatesPanelProps = {
  entries: RecentUpdateEntry[];
  students: ClassroomProgressStudent[];
};

export function RecentUpdatesPanel({ entries, students }: RecentUpdatesPanelProps) {
  const studentsById = React.useMemo(() => {
    const m = new Map<string, ClassroomProgressStudent>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

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
        const student = studentsById.get(e.childId);
        if (!student) return null;
        const display = student.preferredName ?? student.fullName.split(" ")[0];
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
            <Avatar initials={initialsFor(student.fullName)} tone={toneFor(student.id)} size={26} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>
                {display}{" "}
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
