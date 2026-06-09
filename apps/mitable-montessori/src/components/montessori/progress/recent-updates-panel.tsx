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
  /** Opens the free-form comment composer. Omitted on surfaces without it. */
  onNewComment?: () => void;
};

function NewCommentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="tap"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-ink-secondary)",
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 0.8, marginTop: -1 }}>
        +
      </span>
      New comment
    </button>
  );
}

function PanelHeader({ onNewComment }: { onNewComment?: () => void }) {
  return (
    <div
      style={{
        padding: "16px 16px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        Recent updates
      </div>
      {onNewComment && <NewCommentButton onClick={onNewComment} />}
    </div>
  );
}

export function RecentUpdatesPanel({ entries, students, onNewComment }: RecentUpdatesPanelProps) {
  const studentsById = React.useMemo(() => {
    const m = new Map<string, ClassroomProgressStudent>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

  if (entries.length === 0) {
    return (
      <div>
        <PanelHeader onNewComment={onNewComment} />
        <div style={{ padding: "2px 16px 18px", color: "var(--color-ink-muted)", fontSize: 12.5 }}>
          No updates yet. Select cells in the grid to record a lesson, or leave a comment.
        </div>
      </div>
    );
  }
  return (
    <div>
      <PanelHeader onNewComment={onNewComment} />
      {entries.slice(0, 24).map((e) => {
        const student = studentsById.get(e.childId);
        if (!student) return null;
        const display = student.preferredName ?? student.fullName.split(" ")[0];
        const isComment = e.kind === "comment";
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
                <span
                  className="font-display"
                  style={{ fontSize: 17, fontWeight: 500, color: "var(--color-ink)" }}
                >
                  {display}
                </span>
                {isComment ? (
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
                    Comment
                  </span>
                ) : (
                  <>
                    {" "}
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
                  </>
                )}
              </div>
              {isComment ? (
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11.5,
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {e.when}
                </div>
              ) : (
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
                        e.status === "-"
                          ? "1px dashed var(--color-border)"
                          : "1px solid transparent",
                      display: "inline-block",
                    }}
                  />
                  <span>
                    {STATUS_LABEL[e.status]} · {e.when}
                  </span>
                </div>
              )}
              {e.noteText && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "var(--font-sans)",
                    fontSize: 13.5,
                    color: "var(--color-ink)",
                    lineHeight: 1.45,
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
