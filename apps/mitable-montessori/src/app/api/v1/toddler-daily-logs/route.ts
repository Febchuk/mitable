import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import {
  dbToddlerDailyLogToDto,
  ensureDefaultToddlerRoutines,
  type ToddlerRoutineCategory,
  type ToddlerRoutineOption,
  type ToddlerTimedEntry,
} from "@/lib/toddler-routines";
import { createAdminClient } from "@/utils/supabase/admin";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function teacherToddlerClassroom(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  schoolId: string,
  classroomId: string
) {
  const { data } = await supabase
    .from("classroom_teacher_assignments")
    .select("classrooms!inner(id, name, code, school_id)")
    .eq("teacher_user_id", userId)
    .eq("classroom_id", classroomId)
    .is("end_date", null)
    .maybeSingle();
  const joined = data?.classrooms as
    | { id: string; name: string; code: string | null; school_id: string }
    | { id: string; name: string; code: string | null; school_id: string }[]
    | null;
  const classroom = Array.isArray(joined) ? joined[0] : joined;
  return classroom?.school_id === schoolId && classroom.code?.toLowerCase() === "toddler"
    ? classroom
    : null;
}

function cleanText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanEntries(value: unknown): ToddlerTimedEntry[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: ToddlerTimedEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const time = cleanText(row.time, 5);
    const outcome = cleanText(row.outcome, 120);
    const detail = cleanText(row.detail, 240);
    if (time && !TIME_RE.test(time)) return null;
    if (!outcome) return null;
    result.push({
      id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
      time,
      outcome,
      ...(detail ? { detail } : {}),
    });
  }
  return result;
}

function optionsByCategory(options: ToddlerRoutineOption[]) {
  const result = new Map<ToddlerRoutineCategory, ToddlerRoutineOption[]>();
  for (const option of options) {
    const rows = result.get(option.category) ?? [];
    rows.push(option);
    result.set(option.category, rows);
  }
  return result;
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher") {
    return NextResponse.json({ error: "Teacher role required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroom") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!classroomId || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Choose a classroom and date" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const classroom = await teacherToddlerClassroom(
    supabase,
    auth.user.userId,
    auth.user.schoolId,
    classroomId
  );
  if (!classroom)
    return NextResponse.json({ error: "Toddler classroom not found" }, { status: 403 });

  await ensureDefaultToddlerRoutines(supabase, auth.user.schoolId);
  const [{ data: enrollments }, { data: optionRows }, { data: logRows }, { data: attendanceRows }] =
    await Promise.all([
      supabase
        .from("student_classroom_enrollments")
        .select(
          "student_id, students!inner(id, first_name, last_name, preferred_name, archived_at)"
        )
        .eq("classroom_id", classroomId)
        .is("end_date", null),
      supabase
        .from("toddler_routine_options")
        .select("id, category, label, sort_order, is_active")
        .eq("school_id", auth.user.schoolId)
        .eq("is_active", true)
        .order("category")
        .order("sort_order"),
      supabase
        .from("toddler_daily_logs")
        .select("*")
        .eq("school_id", auth.user.schoolId)
        .eq("classroom_id", classroomId)
        .eq("log_date", date),
      supabase
        .from("attendance_records")
        .select("student_id, status, arrival_time")
        .eq("classroom_id", classroomId)
        .eq("attendance_date", date),
    ]);

  const students = (enrollments ?? [])
    .map((row) => {
      const joined = row.students as
        | {
            id: string;
            first_name: string;
            last_name: string;
            preferred_name: string | null;
            archived_at: string | null;
          }
        | {
            id: string;
            first_name: string;
            last_name: string;
            preferred_name: string | null;
            archived_at: string | null;
          }[];
      const student = Array.isArray(joined) ? joined[0] : joined;
      return student && !student.archived_at
        ? {
            id: student.id,
            name: student.preferred_name || `${student.first_name} ${student.last_name}`.trim(),
          }
        : null;
    })
    .filter((student): student is { id: string; name: string } => !!student)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    classroom: { id: classroom.id, name: classroom.name },
    students,
    options: (optionRows ?? []).map((row) => ({
      id: row.id as string,
      category: row.category as ToddlerRoutineCategory,
      label: row.label as string,
      sortOrder: row.sort_order as number,
      isActive: row.is_active as boolean,
    })),
    logs: (logRows ?? []).map((row) => dbToddlerDailyLogToDto(row)),
    attendance: Object.fromEntries(
      (attendanceRows ?? []).map((row) => [
        row.student_id,
        { status: row.status, arrivalTime: row.arrival_time },
      ])
    ),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher") {
    return NextResponse.json({ error: "Teacher role required" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const classroomId = cleanText(body?.classroomId, 36);
  const studentId = cleanText(body?.studentId, 36);
  const logDate = cleanText(body?.logDate, 10);
  if (!classroomId || !studentId || !DATE_RE.test(logDate)) {
    return NextResponse.json(
      { error: "Student, classroom, and date are required" },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  const classroom = await teacherToddlerClassroom(
    supabase,
    auth.user.userId,
    auth.user.schoolId,
    classroomId
  );
  if (!classroom)
    return NextResponse.json({ error: "Toddler classroom not found" }, { status: 403 });
  const { data: enrollment } = await supabase
    .from("student_classroom_enrollments")
    .select("id")
    .eq("classroom_id", classroomId)
    .eq("student_id", studentId)
    .is("end_date", null)
    .maybeSingle();
  if (!enrollment)
    return NextResponse.json({ error: "Student is not in this classroom" }, { status: 403 });

  const { data: rows } = await supabase
    .from("toddler_routine_options")
    .select("id, category, label, sort_order, is_active")
    .eq("school_id", auth.user.schoolId)
    .eq("is_active", true);
  const options = (rows ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as ToddlerRoutineCategory,
    label: row.label as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
  }));
  const grouped = optionsByCategory(options);
  const labelAllowed = (category: ToddlerRoutineCategory, label: string) =>
    !label || (grouped.get(category) ?? []).some((option) => option.label === label);
  const mood = cleanText(body?.mood, 120);
  const nap = cleanText(body?.nap, 120);
  const participation = cleanText(body?.participation, 120);
  const toiletingEntries = cleanEntries(body?.toiletingEntries);
  const feedingEntries = cleanEntries(body?.feedingEntries);
  const outdoorPlayEntries = cleanEntries(body?.outdoorPlayEntries);
  if (
    !labelAllowed("mood", mood) ||
    !labelAllowed("nap", nap) ||
    !labelAllowed("participation", participation) ||
    !toiletingEntries ||
    !feedingEntries ||
    !outdoorPlayEntries ||
    !toiletingEntries.every((entry) => labelAllowed("toileting", entry.outcome)) ||
    !feedingEntries.every((entry) => labelAllowed("meal_response", entry.outcome)) ||
    !outdoorPlayEntries.every((entry) => labelAllowed("outdoor_response", entry.outcome))
  ) {
    return NextResponse.json({ error: "One or more routine choices are invalid" }, { status: 400 });
  }
  const requestedActivityIds = Array.isArray(body?.activityOptionIds)
    ? body.activityOptionIds.filter((id): id is string => typeof id === "string")
    : [];
  const requestedMaterialIds = Array.isArray(body?.materialOptionIds)
    ? body.materialOptionIds.filter((id): id is string => typeof id === "string")
    : [];
  const activityOptions = (grouped.get("activity") ?? []).filter((option) =>
    requestedActivityIds.includes(option.id)
  );
  const materialOptions = (grouped.get("material") ?? []).filter((option) =>
    requestedMaterialIds.includes(option.id)
  );
  if (
    activityOptions.length !== new Set(requestedActivityIds).size ||
    materialOptions.length !== new Set(requestedMaterialIds).size
  ) {
    return NextResponse.json(
      { error: "One or more selected activities are invalid" },
      { status: 400 }
    );
  }

  const payload = {
    school_id: auth.user.schoolId,
    classroom_id: classroomId,
    student_id: studentId,
    log_date: logDate,
    mood: mood || null,
    nap: nap || null,
    participation: participation || null,
    toileting_entries: toiletingEntries,
    feeding_entries: feedingEntries,
    outdoor_play_entries: outdoorPlayEntries,
    activity_option_ids: activityOptions.map((option) => option.id),
    activity_labels: activityOptions.map((option) => option.label),
    material_option_ids: materialOptions.map((option) => option.id),
    material_labels: materialOptions.map((option) => option.label),
    other_notes: cleanText(body?.otherNotes) || null,
    teacher_comments: cleanText(body?.teacherComments) || null,
    created_by_user_id: auth.user.userId,
    updated_by_user_id: auth.user.userId,
  };
  const { data, error } = await supabase
    .from("toddler_daily_logs")
    .upsert(payload, { onConflict: "classroom_id,student_id,log_date" })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Couldn't save daily log" },
      { status: 500 }
    );
  }
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "teacher",
    action: "toddler_daily_log.save",
    target_table: "toddler_daily_logs",
    target_id: data.id as string,
    metadata: { classroom_id: classroomId, student_id: studentId, log_date: logDate },
  });
  return NextResponse.json({ log: dbToddlerDailyLogToDto(data) });
}
