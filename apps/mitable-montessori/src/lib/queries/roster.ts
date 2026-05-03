import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";

export type RosterRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
  age: string | null;
  enrolledAt: string | null;
  guardianCount: number;
};

export type RosterResult = {
  classroomName: string | null;
  rows: RosterRow[];
};

type StudentDbRow = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  student_classroom_enrollments: Array<{
    classroom_id: string;
    start_date: string;
    end_date: string | null;
    is_primary: boolean;
  }>;
  student_guardians: Array<{ guardian_id: string }>;
};

function ageFromBirthDate(birthDate: string | null): string | null {
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

/**
 * Returns the roster for the current teacher's active classroom. Students
 * who don't have an active enrollment in that classroom are filtered out.
 * RLS confines the select to students the caller can see, so this is
 * additionally defensive (admins might see more than one classroom).
 */
export async function listClassroomRoster(): Promise<RosterResult> {
  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) return { classroomName: null, rows: [] };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, preferred_name, birth_date, " +
        "student_classroom_enrollments(classroom_id, start_date, end_date, is_primary), " +
        "student_guardians(guardian_id)"
    )
    .is("archived_at", null)
    .returns<StudentDbRow[]>();

  const rows: RosterRow[] = (data ?? [])
    .map((s) => {
      const activeEnrollment = s.student_classroom_enrollments.find(
        (e) => e.end_date === null && e.classroom_id === classroom.id
      );
      if (!activeEnrollment) return null;
      return {
        id: s.id,
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        preferredName: s.preferred_name,
        age: ageFromBirthDate(s.birth_date),
        enrolledAt: formatEnrolled(activeEnrollment.start_date),
        guardianCount: s.student_guardians.length,
      };
    })
    .filter((r): r is RosterRow => r !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { classroomName: classroom.name, rows };
}
