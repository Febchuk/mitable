"use client";

import * as React from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { Tone } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";
import type { EnrollmentRow } from "@/lib/db/types";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

type RosterDisplayRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
  age: string | null;
  enrolledAt: string | null;
  guardianCount: number;
};

function ageFromBirthDate(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}y ${months}m`;
}

function formatEnrolled(start: string | null): string | null {
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function RosterFromDexie({
  classroomId,
  classroomName,
}: {
  classroomId: string | null;
  classroomName: string | null;
}) {
  // Active enrollments for this classroom — cheap, indexed read.
  // useLiveQuery returns `undefined` until the first resolution; we treat
  // that as "still loading" and let the page-level loading.tsx render.
  const enrollments = useLiveQuery<EnrollmentRow[] | undefined>(
    async () => {
      if (!classroomId) return [];
      const db = getDb();
      const all = await db.enrollments.where("classroomId").equals(classroomId).toArray();
      return all.filter((e) => e.endDate === null);
    },
    [classroomId]
  );

  // Decrypt roster + count guardians for each enrolled student.
  const [rows, setRows] = React.useState<RosterDisplayRow[] | null>(null);

  React.useEffect(() => {
    if (!enrollments) return;
    let cancelled = false;
    (async () => {
      const db = getDb();
      const studentIds = enrollments.map((e) => e.studentId);
      if (studentIds.length === 0) {
        if (!cancelled) setRows([]);
        return;
      }
      const [encryptedStudents, guardians] = await Promise.all([
        db.roster.where("id").anyOf(studentIds).toArray(),
        db.studentGuardians.where("studentId").anyOf(studentIds).toArray(),
      ]);
      const guardianCounts = new Map<string, number>();
      for (const sg of guardians) {
        guardianCounts.set(sg.studentId, (guardianCounts.get(sg.studentId) ?? 0) + 1);
      }
      const enrollmentByStudent = new Map(enrollments.map((e) => [e.studentId, e]));
      const decrypted = await Promise.all(encryptedStudents.map((r) => decryptRoster(r)));
      const out = decrypted
        .map((r) => {
          const enrollment = enrollmentByStudent.get(r.id);
          return {
            id: r.id,
            fullName: `${r.firstName} ${r.lastName}`.trim(),
            preferredName: r.preferredName ?? null,
            age: ageFromBirthDate(r.birthDate),
            enrolledAt: formatEnrolled(enrollment?.startDate ?? null),
            guardianCount: guardianCounts.get(r.id) ?? 0,
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrollments]);

  // Initial paint before bootstrap finishes — show the loading shell from
  // loading.tsx by returning null. After Dexie resolves, render rows.
  if (rows === null) return null;

  const overline = classroomName
    ? `${classroomName} · ${rows.length} ${rows.length === 1 ? "child" : "children"}`
    : "No active classroom";

  return (
    <div>
      <PageHeader overline={overline} title="Roster" />
      <div style={{ padding: "16px 24px 60px" }}>
        {rows.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              padding: 24,
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: 13.5,
            }}
          >
            {classroomName
              ? "No children enrolled in this classroom yet."
              : "You aren't assigned to a classroom yet. Ask your admin to set one up."}
          </div>
        ) : (
          <>
            <div className="hidden lg:block" style={cardStyle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.8fr 24px",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {["Child", "Age", "Enrolled", "Family", ""].map((h) => (
                  <div key={h} className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                    {h}
                  </div>
                ))}
              </div>
              {rows.map((c) => (
                <RosterDesktopRow key={c.id} c={c} />
              ))}
            </div>

            <div className="lg:hidden" style={cardStyle}>
              {rows.map((c, i) => (
                <RosterMobileRow key={c.id} c={c} firstRow={i === 0} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RosterDesktopRow({ c }: { c: RosterDisplayRow }) {
  const display = c.preferredName || c.fullName;
  return (
    <Link
      href={`/app/children/${c.id}`}
      className="tap"
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.8fr 24px",
        alignItems: "center",
        padding: "12px 20px",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        borderTop: "1px solid var(--color-border)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar initials={initialsFor(display)} tone={toneFor(c.id)} size={34} />
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>{display}</div>
      </div>
      <div className="font-numeric" style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {c.age ?? "—"}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{c.enrolledAt ?? "—"}</div>
      <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {c.guardianCount === 0
          ? "No guardian"
          : c.guardianCount === 1
            ? "1 guardian"
            : `${c.guardianCount} guardians`}
      </div>
      <ChevronRight size={14} strokeWidth={1.5} />
    </Link>
  );
}

function RosterMobileRow({ c, firstRow }: { c: RosterDisplayRow; firstRow: boolean }) {
  const display = c.preferredName || c.fullName;
  return (
    <Link
      href={`/app/children/${c.id}`}
      className="tap"
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "transparent",
        border: 0,
        borderTop: firstRow ? "0" : "1px solid var(--color-border)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Avatar initials={initialsFor(display)} tone={toneFor(c.id)} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ink)" }}>{display}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.enrolledAt ? `Enrolled ${c.enrolledAt}` : ""}
        </div>
      </div>
      <div className="font-numeric" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {c.age ?? ""}
      </div>
      <ChevronRight size={16} strokeWidth={1.5} />
    </Link>
  );
}
