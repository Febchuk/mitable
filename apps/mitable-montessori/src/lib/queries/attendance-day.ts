import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { listTeacherClassroomsForCurrentUser } from "@/lib/app/active-classroom";
import {
  ALL_CLASSROOMS_ID,
  type AttendanceDayData,
  type AttendanceDayStudent,
  isValidDateString,
  localDateString,
} from "./attendance-day-model";

type EnrollmentRow = {
  student_id: string;
  classroom_id: string;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    archived_at: string | null;
  } | null;
};

type RecordRow = {
  student_id: string;
  status: "present" | "absent";
  comment: string | null;
  arrival_time: string | null;
};

/** Strip seconds off a Postgres `time` value: "08:30:00" → "08:30". */
function trimSeconds(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{2}:\d{2})/.exec(t);
  return m ? m[1] : t;
}

/**
 * Loads the daily attendance register for the current teacher's active
 * classroom. Returns one row per currently-enrolled student, with their
 * status / comment / arrival time merged in from `attendance_records`.
 *
 * If `date` is missing or malformed, falls back to today (server's local TZ).
 */
function recordKey(classroomId: string, studentId: string) {
  return `${classroomId}:${studentId}`;
}

async function loadAttendanceStudents(
  supabase: ReturnType<typeof createClient>,
  classrooms: Array<{ id: string; name: string }>,
  safeDate: string
): Promise<AttendanceDayStudent[]> {
  if (classrooms.length === 0) return [];

  const classroomIds = classrooms.map((c) => c.id);
  const nameById = new Map(classrooms.map((c) => [c.id, c.name] as const));

  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select(
      "student_id, classroom_id, students(id, first_name, last_name, preferred_name, archived_at)"
    )
    .in("classroom_id", classroomIds)
    .is("end_date", null)
    .returns<EnrollmentRow[]>();

  const activeEnrollments = (enrollments ?? []).filter(
    (e) => e.students !== null && e.students.archived_at === null
  );
  if (activeEnrollments.length === 0) return [];

  const { data: records } = await supabase
    .from("attendance_records")
    .select("student_id, classroom_id, status, comment, arrival_time")
    .in("classroom_id", classroomIds)
    .eq("attendance_date", safeDate)
    .returns<Array<RecordRow & { classroom_id: string }>>();

  const byEnrollment = new Map(
    (records ?? []).map((r) => [recordKey(r.classroom_id, r.student_id), r] as [string, RecordRow])
  );

  return activeEnrollments
    .map((e) => {
      const s = e.students!;
      const r = byEnrollment.get(recordKey(e.classroom_id, s.id));
      return {
        id: s.id,
        classroomId: e.classroom_id,
        classroomName: nameById.get(e.classroom_id) ?? "Classroom",
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        preferredName: s.preferred_name,
        status: r?.status ?? null,
        comment: r?.comment ?? null,
        arrivalTime: trimSeconds(r?.arrival_time ?? null),
      };
    })
    .sort((a, b) => {
      const byClass = a.classroomName.localeCompare(b.classroomName);
      if (byClass !== 0) return byClass;
      return a.fullName.localeCompare(b.fullName);
    });
}

export async function getAttendanceDay(
  date?: string,
  classroomId?: string
): Promise<AttendanceDayData> {
  const safeDate = date && isValidDateString(date) ? date : localDateString();
  const teacherClassrooms = await listTeacherClassroomsForCurrentUser();

  const wantsAll =
    !classroomId ||
    classroomId === ALL_CLASSROOMS_ID ||
    !teacherClassrooms.some((c) => c.id === classroomId);

  if (wantsAll) {
    if (teacherClassrooms.length === 0) {
      return {
        classroomId: null,
        classroomName: null,
        date: safeDate,
        students: [],
      };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const students = await loadAttendanceStudents(supabase, teacherClassrooms, safeDate);

    return {
      classroomId: ALL_CLASSROOMS_ID,
      classroomName: "All classes",
      date: safeDate,
      students,
    };
  }

  const classroom = teacherClassrooms.find((c) => c.id === classroomId)!;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const students = await loadAttendanceStudents(supabase, [classroom], safeDate);

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    date: safeDate,
    students,
  };
}
