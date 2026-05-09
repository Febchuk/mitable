import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Server-side roster snapshot for the agent. Returns every student actively
 * enrolled in the given classroom, with the searchable needles (first +
 * preferred + nicknames + full names) Fuse.js will index.
 *
 * The browser-side equivalent lives in `src/lib/tokenize/roster-index.ts`.
 * They share the same needle shape so the two index types stay in sync.
 */

export interface RosterStudent {
  id: string;
  schoolId: string;
  classroomId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  nicknames: string[];
  /** What the UI displays — preferred + last when available, else first + last. */
  display: string;
  /** Searchable strings fed to Fuse. */
  needles: string[];
}

interface StudentRow {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  nicknames: string[] | null;
  student_classroom_enrollments: Array<{
    classroom_id: string;
    end_date: string | null;
  }>;
}

export async function loadClassroomRoster(args: {
  classroomId: string;
  schoolId: string;
}): Promise<RosterStudent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, school_id, first_name, last_name, preferred_name, nicknames, " +
        "student_classroom_enrollments(classroom_id, end_date)"
    )
    .eq("school_id", args.schoolId)
    .is("archived_at", null)
    .returns<StudentRow[]>();

  if (error || !data) return [];

  const out: RosterStudent[] = [];
  for (const s of data) {
    const enrolled = s.student_classroom_enrollments.some(
      (e) => e.classroom_id === args.classroomId && e.end_date === null
    );
    if (!enrolled) continue;
    const firstName = s.first_name?.trim() ?? "";
    const lastName = s.last_name?.trim() ?? "";
    const preferred = s.preferred_name?.trim() || null;
    const nicknames = (s.nicknames ?? []).map((n) => n.trim()).filter(Boolean);
    const display = preferred ? `${preferred} ${lastName}` : `${firstName} ${lastName}`;
    const needleSet = new Set<string>();
    if (firstName) needleSet.add(firstName);
    if (lastName) needleSet.add(lastName);
    if (firstName && lastName) needleSet.add(`${firstName} ${lastName}`);
    if (preferred) {
      needleSet.add(preferred);
      if (lastName) needleSet.add(`${preferred} ${lastName}`);
    }
    for (const n of nicknames) needleSet.add(n);
    out.push({
      id: s.id,
      schoolId: s.school_id,
      classroomId: args.classroomId,
      firstName,
      lastName,
      preferredName: preferred,
      nicknames,
      display: display.trim(),
      needles: Array.from(needleSet),
    });
  }
  return out;
}
