import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type GuardianSummary = {
  id: string;
  name: string;
  relationship: string | null;
  primary: boolean;
  contact: string;
};

export type StudentProfile = {
  id: string;
  fullName: string;
  preferredName: string | null;
  birthDate: string | null;
  notes: string | null;
  classroom: { id: string; name: string } | null;
  enrollmentStartDate: string | null;
  primaryTeacher: { id: string; name: string } | null;
  guardians: GuardianSummary[];
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  notes: string | null;
  archived_at: string | null;
};

type EnrollmentRow = {
  classroom_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  classrooms: { id: string; name: string } | null;
};

type AssignmentRow = {
  classroom_role: "lead" | "support" | "assistant" | null;
  start_date: string;
  end_date: string | null;
  users: { id: string; first_name: string | null; last_name: string | null } | null;
};

type StudentGuardianRow = {
  relationship: string | null;
  is_primary_contact: boolean;
  guardians: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    preferred_contact_method: "email" | "phone" | "either" | null;
  } | null;
};

function preferredContact(
  email: string | null,
  phone: string | null,
  pref: "email" | "phone" | "either" | null
): string {
  if (pref === "phone" && phone) return phone;
  if (pref === "email" && email) return email;
  return email ?? phone ?? "";
}

/**
 * Returns null if the student doesn't exist, is archived, or the caller isn't
 * authorized to see them (RLS will filter both cases identically).
 */
export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, birth_date, notes, archived_at")
    .eq("id", studentId)
    .maybeSingle<StudentRow>();
  if (!student || student.archived_at) return null;

  const [enrollmentResp, guardiansResp] = await Promise.all([
    supabase
      .from("student_classroom_enrollments")
      .select("classroom_id, start_date, end_date, is_primary, classrooms(id, name)")
      .eq("student_id", studentId)
      .is("end_date", null)
      .order("is_primary", { ascending: false })
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle<EnrollmentRow>(),
    supabase
      .from("student_guardians")
      .select(
        "relationship, is_primary_contact, guardians(id, first_name, last_name, email, phone, preferred_contact_method)"
      )
      .eq("student_id", studentId)
      .order("is_primary_contact", { ascending: false })
      .returns<StudentGuardianRow[]>(),
  ]);

  const enrollment = enrollmentResp.data;

  let primaryTeacher: StudentProfile["primaryTeacher"] = null;
  if (enrollment) {
    const { data: assignment } = await supabase
      .from("classroom_teacher_assignments")
      .select("classroom_role, start_date, end_date, users(id, first_name, last_name)")
      .eq("classroom_id", enrollment.classroom_id)
      .eq("classroom_role", "lead")
      .is("end_date", null)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle<AssignmentRow>();
    if (assignment?.users) {
      const u = assignment.users;
      primaryTeacher = {
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Lead teacher",
      };
    }
  }

  const guardians: GuardianSummary[] = (guardiansResp.data ?? [])
    .filter(
      (
        sg
      ): sg is StudentGuardianRow & { guardians: NonNullable<StudentGuardianRow["guardians"]> } =>
        sg.guardians != null
    )
    .map((sg) => {
      const g = sg.guardians;
      return {
        id: g.id,
        name: `${g.first_name} ${g.last_name}`.trim(),
        relationship: sg.relationship,
        primary: sg.is_primary_contact,
        contact: preferredContact(g.email, g.phone, g.preferred_contact_method),
      };
    });

  return {
    id: student.id,
    fullName: `${student.first_name} ${student.last_name}`.trim(),
    preferredName: student.preferred_name,
    birthDate: student.birth_date,
    notes: student.notes,
    classroom: enrollment?.classrooms ?? null,
    enrollmentStartDate: enrollment?.start_date ?? null,
    primaryTeacher,
    guardians,
  };
}
