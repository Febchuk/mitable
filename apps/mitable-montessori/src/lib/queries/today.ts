import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";

function todayDateString(): string {
  // Local-day in ISO format. Used to query attendance_records.attendance_date.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type TodayAttendanceStudent = {
  id: string;
  fullName: string;
  preferredName: string | null;
  status: "present" | "absent" | null;
};

export type TodayAttendance = {
  classroomName: string | null;
  date: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  unmarkedCount: number;
  students: TodayAttendanceStudent[];
};

export async function getTodayAttendance(): Promise<TodayAttendance> {
  const classroom = await getActiveClassroomForCurrentUser();
  const today = todayDateString();
  if (!classroom) {
    return {
      classroomName: null,
      date: today,
      totalStudents: 0,
      presentCount: 0,
      absentCount: 0,
      unmarkedCount: 0,
      students: [],
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Students currently enrolled in this classroom.
  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id, students(id, first_name, last_name, preferred_name, archived_at)")
    .eq("classroom_id", classroom.id)
    .is("end_date", null)
    .returns<
      Array<{
        student_id: string;
        students: {
          id: string;
          first_name: string;
          last_name: string;
          preferred_name: string | null;
          archived_at: string | null;
        } | null;
      }>
    >();

  const studentIds = (enrollments ?? [])
    .map((e) => e.students)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.archived_at === null)
    .map((s) => s.id);

  // Today's attendance rows. RLS restricts to the teacher's scope.
  const { data: records } = studentIds.length
    ? await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("classroom_id", classroom.id)
        .eq("attendance_date", today)
        .returns<Array<{ student_id: string; status: "present" | "absent" }>>()
    : { data: [] };

  const statusByStudent = new Map<string, "present" | "absent">(
    (records ?? []).map((r) => [r.student_id, r.status])
  );

  const students: TodayAttendanceStudent[] = (enrollments ?? [])
    .map((e) => e.students)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.archived_at === null)
    .map((s) => ({
      id: s.id,
      fullName: `${s.first_name} ${s.last_name}`.trim(),
      preferredName: s.preferred_name,
      status: statusByStudent.get(s.id) ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const presentCount = students.filter((s) => s.status === "present").length;
  const absentCount = students.filter((s) => s.status === "absent").length;
  const unmarkedCount = students.filter((s) => s.status === null).length;

  return {
    classroomName: classroom.name,
    date: today,
    totalStudents: students.length,
    presentCount,
    absentCount,
    unmarkedCount,
    students,
  };
}

export type CapturedTodayEntry = {
  kind: "curriculum" | "whole-child";
  id: string;
  studentId: string;
  studentName: string;
  studentPreferredName: string | null;
  /** Subtopic name for curriculum events; axis label for whole-child. */
  contextLabel: string;
  comment: string;
  authorName: string | null;
  createdAt: string;
};

export async function listCapturedToday(limit = 8): Promise<CapturedTodayEntry[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Resolve the teacher's school for the axis label join.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("school_id").eq("id", user.id).maybeSingle<{
        school_id: string;
      }>()
    : { data: null };
  const schoolId = profile?.school_id ?? null;

  const since = startOfTodayIso();

  const [eventsResp, obsResp, axesResp] = await Promise.all([
    supabase
      .from("curriculum_events")
      .select(
        "id, student_id, comment, created_at, " +
          "students(first_name, last_name, preferred_name), " +
          "curriculum_subtopics(name), " +
          "users:author_user_id(first_name, last_name)"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        Array<{
          id: string;
          student_id: string;
          comment: string;
          created_at: string;
          students: {
            first_name: string;
            last_name: string;
            preferred_name: string | null;
          } | null;
          curriculum_subtopics: { name: string } | null;
          users: { first_name: string | null; last_name: string | null } | null;
        }>
      >(),
    supabase
      .from("whole_child_observations")
      .select(
        "id, student_id, axis_key, note, created_at, " +
          "students(first_name, last_name, preferred_name), " +
          "users:author_user_id(first_name, last_name)"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        Array<{
          id: string;
          student_id: string;
          axis_key: string;
          note: string;
          created_at: string;
          students: {
            first_name: string;
            last_name: string;
            preferred_name: string | null;
          } | null;
          users: { first_name: string | null; last_name: string | null } | null;
        }>
      >(),
    schoolId
      ? supabase
          .from("axes")
          .select("key, label")
          .eq("school_id", schoolId)
          .returns<Array<{ key: string; label: string }>>()
      : Promise.resolve({ data: [] as Array<{ key: string; label: string }> }),
  ]);

  const axisLabels = new Map((axesResp.data ?? []).map((a) => [a.key, a.label]));
  const authorName = (
    u: { first_name: string | null; last_name: string | null } | null
  ): string | null => {
    if (!u) return null;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || null;
  };
  const studentName = (s: { first_name: string; last_name: string } | null): string =>
    s ? `${s.first_name} ${s.last_name}`.trim() : "Unknown";

  const fromCurriculum: CapturedTodayEntry[] = (eventsResp.data ?? []).map((e) => ({
    kind: "curriculum",
    id: e.id,
    studentId: e.student_id,
    studentName: studentName(e.students),
    studentPreferredName: e.students?.preferred_name ?? null,
    contextLabel: e.curriculum_subtopics?.name ?? "Subtopic",
    comment: e.comment,
    authorName: authorName(e.users),
    createdAt: e.created_at,
  }));

  const fromWholeChild: CapturedTodayEntry[] = (obsResp.data ?? []).map((o) => ({
    kind: "whole-child",
    id: o.id,
    studentId: o.student_id,
    studentName: studentName(o.students),
    studentPreferredName: o.students?.preferred_name ?? null,
    contextLabel: axisLabels.get(o.axis_key) ?? o.axis_key,
    comment: o.note,
    authorName: authorName(o.users),
    createdAt: o.created_at,
  }));

  return [...fromCurriculum, ...fromWholeChild]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export type DraftReport = {
  id: string;
  studentId: string;
  studentName: string;
  reportType: "daily" | "major";
  title: string | null;
  updatedAt: string;
};

export async function listDraftReports(): Promise<DraftReport[]> {
  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("reports")
    .select(
      "id, student_id, report_type, title, updated_at, students(first_name, last_name, preferred_name)"
    )
    .eq("classroom_id", classroom.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .returns<
      Array<{
        id: string;
        student_id: string;
        report_type: "daily" | "major";
        title: string | null;
        updated_at: string;
        students: {
          first_name: string;
          last_name: string;
          preferred_name: string | null;
        } | null;
      }>
    >();

  return (data ?? []).map((r) => {
    const display =
      r.students?.preferred_name ||
      (r.students ? `${r.students.first_name} ${r.students.last_name}`.trim() : "Unknown");
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: display,
      reportType: r.report_type,
      title: r.title,
      updatedAt: r.updated_at,
    };
  });
}
