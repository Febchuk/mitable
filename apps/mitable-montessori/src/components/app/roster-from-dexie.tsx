"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";
import type { EnrollmentRow } from "@/lib/db/types";
import {
  RosterListView,
  ageFromBirthDate,
  formatEnrolled,
  type RosterListViewRow,
} from "@/components/roster/roster-list-view";

export function RosterFromDexie({
  classroomId,
  classroomName,
}: {
  classroomId: string | null;
  classroomName: string | null;
}) {
  const enrollments = useLiveQuery<EnrollmentRow[] | undefined>(async () => {
    if (!classroomId) return [];
    const db = getDb();
    const all = await db.enrollments.where("classroomId").equals(classroomId).toArray();
    return all.filter((e) => e.endDate === null);
  }, [classroomId]);

  const [rows, setRows] = React.useState<RosterListViewRow[] | null>(null);

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
      const out: RosterListViewRow[] = decrypted
        .map((r) => {
          const enrollment = enrollmentByStudent.get(r.id);
          const display = r.preferredName?.trim() || `${r.firstName} ${r.lastName}`.trim();
          return {
            id: r.id,
            href: `/app/children/${r.id}`,
            displayName: display,
            initialsSource: display,
            age: ageFromBirthDate(r.birthDate),
            enrolledAt: formatEnrolled(enrollment?.startDate ?? null),
            guardianCount: guardianCounts.get(r.id) ?? 0,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrollments]);

  if (rows === null) return null;

  const overline = classroomName
    ? `${classroomName} · ${rows.length} ${rows.length === 1 ? "child" : "children"}`
    : "No active classroom";

  return (
    <RosterListView
      overline={overline}
      title="Classroom"
      rows={rows}
      emptyMessage={
        classroomName
          ? "No children enrolled in this classroom yet."
          : "You aren't assigned to a classroom yet. Ask your admin to set one up."
      }
    />
  );
}
