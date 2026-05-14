import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";

type EnrRow = {
  classroom_id: string;
  start_date: string;
  end_date: string | null;
  classrooms: { name: string } | { name: string }[] | null;
};

type StRow = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  student_classroom_enrollments: EnrRow[] | EnrRow | null;
  student_guardians: { guardian_id: string }[] | { guardian_id: string } | null;
};

function classroomNameFromEnrollment(e: EnrRow): string {
  const c = e.classrooms;
  if (!c) return "Classroom";
  const row = Array.isArray(c) ? c[0] : c;
  return row?.name?.trim() || "Classroom";
}

/**
 * School-wide roster for admins: one row per student with active classroom
 * memberships and guardian counts.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const schoolId = auth.user.schoolId;

  const { data, error } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, preferred_name, birth_date, " +
        "student_classroom_enrollments(classroom_id, start_date, end_date, classrooms(name)), " +
        "student_guardians(guardian_id)"
    )
    .eq("school_id", schoolId)
    .is("archived_at", null)
    .order("first_name")
    .order("last_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const students = (data ?? []) as unknown as StRow[];

  const out = students.map((s) => {
    const enrsRaw = s.student_classroom_enrollments;
    const enrs: EnrRow[] = Array.isArray(enrsRaw) ? enrsRaw : enrsRaw ? [enrsRaw] : [];
    const active = enrs.filter((e) => e.end_date === null);
    const pairs = active
      .map((e) => ({
        id: e.classroom_id,
        name: classroomNameFromEnrollment(e),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const starts = active.map((e) => e.start_date).filter(Boolean);
    const earliest = starts.length ? [...starts].sort()[0] : null;

    const sgRaw = s.student_guardians;
    const sgList = Array.isArray(sgRaw) ? sgRaw : sgRaw ? [sgRaw] : [];
    const guardianCount = sgList.length;

    return {
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      preferredName: s.preferred_name,
      birthDate: s.birth_date,
      guardianCount,
      enrolledEarliest: earliest,
      classrooms: pairs,
    };
  });

  out.sort(
    (a, b) =>
      a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" }) ||
      a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );

  return NextResponse.json({ students: out });
}
