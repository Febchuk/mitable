import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import {
  type AttendanceDayData,
  type AttendanceDayStudent,
  isValidDateString,
  localDateString,
} from "./attendance-day-model";

type EnrollmentRow = {
  student_id: string;
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
export async function getAttendanceDay(date?: string): Promise<AttendanceDayData> {
  const safeDate = date && isValidDateString(date) ? date : localDateString();
  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) {
    return {
      classroomId: null,
      classroomName: null,
      date: safeDate,
      students: [],
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id, students(id, first_name, last_name, preferred_name, archived_at)")
    .eq("classroom_id", classroom.id)
    .is("end_date", null)
    .returns<EnrollmentRow[]>();

  const activeStudents = (enrollments ?? [])
    .map((e) => e.students)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.archived_at === null);

  const { data: records } = activeStudents.length
    ? await supabase
        .from("attendance_records")
        .select("student_id, status, comment, arrival_time")
        .eq("classroom_id", classroom.id)
        .eq("attendance_date", safeDate)
        .returns<RecordRow[]>()
    : { data: [] as RecordRow[] };

  const byStudent = new Map((records ?? []).map((r) => [r.student_id, r] as [string, RecordRow]));

  const students: AttendanceDayStudent[] = activeStudents
    .map((s) => {
      const r = byStudent.get(s.id);
      return {
        id: s.id,
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        preferredName: s.preferred_name,
        status: r?.status ?? null,
        comment: r?.comment ?? null,
        arrivalTime: trimSeconds(r?.arrival_time ?? null),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    date: safeDate,
    students,
  };
}
