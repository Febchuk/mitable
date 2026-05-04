import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { listCapturedToday, todayDateString, type CapturedTodayEntry } from "@/lib/queries/today";

export type AdminSchoolAttendance = {
  date: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  unmarkedCount: number;
  presentStudents: Array<{
    id: string;
    fullName: string;
    preferredName: string | null;
  }>;
};

export type AdminPendingReport = {
  id: string;
  studentId: string;
  studentName: string;
  reportType: "daily" | "major" | "incident";
  title: string | null;
  updatedAt: string;
  status: string;
};

export type AdminTodayData = {
  dateLabel: string;
  attendance: AdminSchoolAttendance;
  captured: CapturedTodayEntry[];
  pendingReports: AdminPendingReport[];
};

function rollupStatus(rows: Array<{ status: "present" | "absent" }>): "present" | "absent" | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => r.status === "present")) return "present";
  return "absent";
}

/** Stable calendar label matching SSR everywhere (UTC date parts). */
export function formatSchoolDayLabel(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function getAdminTodayData(schoolId: string): Promise<AdminTodayData> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const today = todayDateString();

  const { data: rooms } = await supabase
    .from("classrooms")
    .select("id")
    .eq("school_id", schoolId)
    .returns<Array<{ id: string }>>();

  const roomIds = (rooms ?? []).map((r) => r.id);

  const emptyAttendance: AdminSchoolAttendance = {
    date: today,
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    unmarkedCount: 0,
    presentStudents: [],
  };

  if (roomIds.length === 0) {
    const captured = await listCapturedToday(16);
    const pendingReports = await listAdminPendingReports(supabase);
    return {
      dateLabel: formatSchoolDayLabel(today),
      attendance: emptyAttendance,
      captured,
      pendingReports,
    };
  }

  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id, students(id, first_name, last_name, preferred_name, archived_at)")
    .in("classroom_id", roomIds)
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

  const studentMap = new Map<string, { fullName: string; preferredName: string | null }>();
  for (const e of enrollments ?? []) {
    const s = e.students;
    if (!s || s.archived_at !== null) continue;
    if (!studentMap.has(s.id)) {
      studentMap.set(s.id, {
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        preferredName: s.preferred_name,
      });
    }
  }

  const { data: attendanceRows } = await supabase
    .from("attendance_records")
    .select("student_id, status")
    .in("classroom_id", roomIds)
    .eq("attendance_date", today)
    .returns<Array<{ student_id: string; status: "present" | "absent" }>>();

  const byStudent = new Map<string, Array<{ status: "present" | "absent" }>>();
  for (const row of attendanceRows ?? []) {
    const arr = byStudent.get(row.student_id) ?? [];
    arr.push({ status: row.status });
    byStudent.set(row.student_id, arr);
  }

  let presentCount = 0;
  let absentCount = 0;
  let unmarkedCount = 0;
  const presentForAvatars: AdminSchoolAttendance["presentStudents"] = [];

  for (const id of studentMap.keys()) {
    const rolled = rollupStatus(byStudent.get(id) ?? []);
    if (rolled === "present") {
      presentCount++;
      const meta = studentMap.get(id)!;
      presentForAvatars.push({
        id,
        fullName: meta.fullName,
        preferredName: meta.preferredName,
      });
    } else if (rolled === "absent") {
      absentCount++;
    } else {
      unmarkedCount++;
    }
  }

  presentForAvatars.sort((a, b) =>
    (a.preferredName || a.fullName).localeCompare(b.preferredName || b.fullName)
  );

  const attendance: AdminSchoolAttendance = {
    date: today,
    totalStudents: studentMap.size,
    presentCount,
    absentCount,
    unmarkedCount,
    presentStudents: presentForAvatars,
  };

  const [captured, pendingReports] = await Promise.all([
    listCapturedToday(16),
    listAdminPendingReports(supabase),
  ]);

  return {
    dateLabel: formatSchoolDayLabel(today),
    attendance,
    captured,
    pendingReports,
  };
}

async function listAdminPendingReports(supabase: SupabaseClient): Promise<AdminPendingReport[]> {
  const { data } = await supabase
    .from("reports")
    .select(
      "id, student_id, report_type, title, updated_at, status, students(first_name, last_name, preferred_name)"
    )
    .in("status", ["submitted_for_review", "in_review", "changes_requested"])
    .order("updated_at", { ascending: false })
    .limit(25)
    .returns<
      Array<{
        id: string;
        student_id: string;
        report_type: "daily" | "major" | "incident";
        title: string | null;
        updated_at: string;
        status: string;
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
      status: r.status,
    };
  });
}
