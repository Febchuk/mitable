"use client";

import * as React from "react";
import { CHILDREN, type Tone } from "@/components/montessori/data";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import type { ClassroomProgressStudent } from "@/lib/queries/classroom-progress";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

type StudentLite = {
  id: string;
  name: string;
  preferredName: string | null;
  tone: Tone;
  speechTargetCount?: number;
};

function rosterFromClassroom(students: ClassroomProgressStudent[]): StudentLite[] {
  return students
    .map((s) => ({
      id: s.id,
      name: s.fullName,
      preferredName: s.preferredName,
      tone: toneFor(s.id),
      speechTargetCount: s.speechTargetCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rosterFromMock(): StudentLite[] {
  return CHILDREN.filter((c) => c.present).map((c) => ({
    id: c.id,
    name: c.name,
    preferredName: null,
    tone: c.tone,
  }));
}

export function SpeechProgressFeature() {
  const store = useMontessori();
  const cp = store.classroomProgress;
  const roster = React.useMemo<StudentLite[]>(
    () => (cp ? rosterFromClassroom(cp.students) : rosterFromMock()),
    [cp]
  );

  const speechFilterEligible = Boolean(cp?.programs.includes("speech"));
  const [onlyWithTargets, setOnlyWithTargets] = React.useState(true);
  const displayRoster = React.useMemo(() => {
    if (!speechFilterEligible || !onlyWithTargets) return roster;
    return roster.filter((s) => (s.speechTargetCount ?? 0) > 0);
  }, [roster, onlyWithTargets, speechFilterEligible]);

  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [targets, setTargets] = React.useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (displayRoster.length === 0) {
      setStudentId(null);
      return;
    }
    setStudentId((cur) => {
      if (cur && displayRoster.some((s) => s.id === cur)) return cur;
      return displayRoster[0]!.id;
    });
  }, [displayRoster]);

  React.useEffect(() => {
    if (!studentId) {
      setTargets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/v1/speech/targets?studentId=${studentId}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          targets?: Array<{ id: string; label: string }>;
        };
        if (!cancelled) {
          setTargets(res.ok ? (data.targets ?? []) : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const student = displayRoster.find((s) => s.id === studentId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <PageHeader
        overline={`Speech${student ? ` · ${student.name.split(" ")[0]}` : ""}`}
        title="Progress"
        subtitle={
          student
            ? `${student.name} — speech therapy targets`
            : "Pick a child to view their targets"
        }
      />

      <div style={{ padding: "12px 16px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
        {speechFilterEligible && roster.length > 0 ? (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "var(--color-ink-secondary)",
              cursor: "pointer",
              userSelect: "none",
              width: "fit-content",
            }}
          >
            <input
              type="checkbox"
              checked={onlyWithTargets}
              onChange={(e) => setOnlyWithTargets(e.target.checked)}
            />
            Only show children with speech targets
          </label>
        ) : null}
        {displayRoster.length === 0 &&
        roster.length > 0 &&
        onlyWithTargets &&
        speechFilterEligible ? (
          <div style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}>
            No one in this class has speech targets yet. Turn off the filter above to pick any
            child.
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "thin",
          }}
        >
          {displayRoster.map((s) => {
            const active = s.id === studentId;
            const label = s.preferredName ?? s.name.split(" ")[0];
            return (
              <button
                key={s.id}
                type="button"
                className="tap"
                onClick={() => setStudentId(s.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px 6px 6px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
                  background: active ? "var(--color-ink)" : "var(--color-surface)",
                  color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Avatar initials={initialsFor(s.name)} tone={s.tone} size={24} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "12px 16px 32px", flex: 1 }}>
        {!student ? (
          <div style={{ color: "var(--color-ink-muted)", fontSize: 13 }}>
            {roster.length === 0 ? "No students in this class yet." : "Pick a child above."}
          </div>
        ) : loading ? (
          <div style={{ color: "var(--color-ink-muted)", fontSize: 13 }}>Loading targets…</div>
        ) : (
          <section
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 14,
              padding: "20px 20px 24px",
              background: "var(--color-surface)",
            }}
          >
            <h2
              style={{
                margin: "0 0 12px",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--color-ink)",
              }}
            >
              Targets
            </h2>
            {targets.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-secondary)" }}>
                No speech targets on file for {student.name.split(" ")[0]} yet. A school admin can
                add them under Curriculum → Speech.
              </p>
            ) : (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 14,
                  color: "var(--color-ink-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {targets.map((t) => (
                  <li key={t.id} style={{ marginBottom: 6 }}>
                    {t.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
