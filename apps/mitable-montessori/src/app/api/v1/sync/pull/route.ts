import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id, school_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "User profile missing" }, { status: 403 });
  }
  const schoolId = profile.school_id as string;

  // Fetch the per-school crypto salt with the service role; school_crypto_salts
  // RLS allows scoped reads, but the salt is small and the read is identity-bound.
  const admin = createAdminClient();
  const { data: saltRow, error: saltErr } = await admin
    .from("school_crypto_salts")
    .select("salt")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (saltErr || !saltRow) {
    return NextResponse.json({ error: "School crypto salt missing" }, { status: 500 });
  }

  // Pull all the read-only roster + curriculum tables. RLS confines results to
  // this school. We use the user-scoped client so policies apply.
  // Soft-hidden classrooms (and kids only enrolled there) are omitted so the
  // offline cache never surfaces them for teachers.
  const [
    students,
    enrollments,
    classrooms,
    classroomTeachers,
    guardians,
    studentGuardians,
    curricula,
    curriculumTopics,
    curriculumSubtopics,
    axes,
    axisAssessments,
    wholeChildObservations,
    curriculumEvents,
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, school_id, first_name, last_name, preferred_name, birth_date, sex, nicknames, notes"
      )
      .is("archived_at", null),
    supabase
      .from("student_classroom_enrollments")
      .select("id, student_id, classroom_id, start_date, end_date, is_primary"),
    supabase
      .from("classrooms")
      .select("id, school_id, curriculum_id, name, code, status, ui_hidden")
      .eq("status", "active"),
    supabase
      .from("classroom_teacher_assignments")
      .select("id, classroom_id, teacher_user_id, classroom_role, start_date, end_date")
      .is("end_date", null),
    supabase
      .from("guardians")
      .select("id, school_id, first_name, last_name, email, phone, preferred_contact_method"),
    supabase
      .from("student_guardians")
      .select("id, student_id, guardian_id, relationship, is_primary_contact, receives_reports"),
    supabase
      .from("curricula")
      .select("id, school_id, name, framework, is_active")
      .eq("is_active", true),
    supabase
      .from("curriculum_topics")
      .select("id, curriculum_id, name, sort_order, is_active")
      .eq("is_active", true),
    supabase
      .from("curriculum_subtopics")
      .select("id, topic_id, name, sort_order, is_active, aliases")
      .eq("is_active", true),
    supabase
      .from("axes")
      .select("id, school_id, key, label, descriptors, sort_order, is_active")
      .eq("is_active", true),
    supabase
      .from("axis_assessments")
      .select(
        "id, student_id, axis_key, level, assessed_at, ended_at, source_observation_id, author_user_id"
      )
      .is("ended_at", null),
    supabase
      .from("whole_child_observations")
      .select(
        "id, student_id, axis_key, from_level, to_level, note, source_observation_id, author_user_id, created_at"
      ),
    supabase
      .from("curriculum_events")
      .select(
        "id, student_id, subtopic_id, comment, transition_to_status, author_user_id, created_at"
      ),
  ]);

  for (const r of [
    students,
    enrollments,
    classrooms,
    classroomTeachers,
    guardians,
    studentGuardians,
    curricula,
    curriculumTopics,
    curriculumSubtopics,
    axes,
    axisAssessments,
    wholeChildObservations,
    curriculumEvents,
  ]) {
    if (r.error) {
      return NextResponse.json({ error: r.error.message }, { status: 500 });
    }
  }

  const allClassrooms = (classrooms.data ?? []) as Array<{
    id: string;
    ui_hidden?: boolean;
    [key: string]: unknown;
  }>;
  const hiddenClassroomIds = new Set(allClassrooms.filter((c) => c.ui_hidden).map((c) => c.id));
  const visibleClassrooms = allClassrooms
    .filter((c) => !c.ui_hidden)
    .map(({ ui_hidden: _omit, ...rest }) => rest);

  const allEnrollments = (enrollments.data ?? []) as Array<{
    student_id: string;
    classroom_id: string;
    end_date: string | null;
    [key: string]: unknown;
  }>;
  const visibleEnrollments = allEnrollments.filter((e) => !hiddenClassroomIds.has(e.classroom_id));
  const studentsWithVisibleRoom = new Set(
    visibleEnrollments.filter((e) => e.end_date === null).map((e) => e.student_id)
  );
  // Kids only enrolled in hidden rooms are dropped. Unassigned kids stay.
  const enrolledStudentIds = new Set(
    allEnrollments.filter((e) => e.end_date === null).map((e) => e.student_id)
  );
  const visibleStudents = ((students.data ?? []) as Array<{ id: string }>).filter(
    (s) => studentsWithVisibleRoom.has(s.id) || !enrolledStudentIds.has(s.id)
  );
  const visibleStudentIds = new Set(visibleStudents.map((s) => s.id));

  const { data: hiddenTeachers } = await admin
    .from("users")
    .select("id")
    .eq("school_id", schoolId)
    .eq("role", "teacher")
    .eq("ui_hidden", true);
  const hiddenTeacherIds = new Set((hiddenTeachers ?? []).map((u) => (u as { id: string }).id));

  const visibleClassroomTeachers = (
    (classroomTeachers.data ?? []) as Array<{
      classroom_id: string;
      teacher_user_id: string;
    }>
  ).filter(
    (a) => !hiddenClassroomIds.has(a.classroom_id) && !hiddenTeacherIds.has(a.teacher_user_id)
  );

  const visibleStudentGuardians = (
    (studentGuardians.data ?? []) as Array<{ student_id: string }>
  ).filter((sg) => visibleStudentIds.has(sg.student_id));

  const visibleAxisAssessments = (
    (axisAssessments.data ?? []) as Array<{ student_id: string }>
  ).filter((r) => visibleStudentIds.has(r.student_id));

  const visibleWholeChild = (
    (wholeChildObservations.data ?? []) as Array<{ student_id: string }>
  ).filter((r) => visibleStudentIds.has(r.student_id));

  const visibleCurriculumEvents = (
    (curriculumEvents.data ?? []) as Array<{ student_id: string }>
  ).filter((r) => visibleStudentIds.has(r.student_id));

  return NextResponse.json({
    salt: saltRow.salt,
    schoolId,
    userId: profile.id,
    data: {
      students: visibleStudents,
      enrollments: visibleEnrollments,
      classrooms: visibleClassrooms,
      classroom_teachers: visibleClassroomTeachers,
      guardians: guardians.data ?? [],
      student_guardians: visibleStudentGuardians,
      curricula: curricula.data ?? [],
      curriculum_topics: curriculumTopics.data ?? [],
      curriculum_subtopics: curriculumSubtopics.data ?? [],
      axes: axes.data ?? [],
      axis_assessments: visibleAxisAssessments,
      whole_child_observations: visibleWholeChild,
      curriculum_events: visibleCurriculumEvents,
    },
  });
}
