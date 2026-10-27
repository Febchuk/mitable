import { createHash } from "node:crypto";
import type { AuthedUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  renderAttendanceEmail,
  sendAttendanceEmail,
  type AttendanceEmail,
} from "@/lib/email/attendance";

type Db = ReturnType<typeof createAdminClient>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class AttendanceSendError extends Error {
  constructor(
    message: string,
    public status = 500
  ) {
    super(message);
  }
}

export type AttendanceSendPlan = {
  confirmation: string;
  present: number;
  absent: number;
  unmarked: number;
  withoutEmail: number;
  deliveries: Array<{
    school_id: string;
    classroom_id: string;
    student_id: string;
    attendance_date: string;
    recipient_email: string;
    snapshot_hash: string;
    payload: AttendanceEmail;
  }>;
};

type Mark = {
  id: string;
  student_id: string;
  classroom_id: string;
  status: "present" | "absent";
  comment: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  half_day: boolean;
  updated_at: string;
  source_command_id: string | null;
};
type Enrollment = {
  student_id: string;
  classroom_id: string;
  students: {
    id: string;
    school_id: string;
    first_name: string;
    last_name: string;
    archived_at: string | null;
  };
};

/** All service-role reads are scoped explicitly, including student and guardian school. */
export async function loadAttendanceSendPlan(
  db: Db,
  user: AuthedUser,
  date: string,
  classroomIds: string[],
  appUrl: string
): Promise<AttendanceSendPlan> {
  const { data: rooms, error: roomError } = await db
    .from("classrooms")
    .select("id, name")
    .eq("school_id", user.schoolId)
    .in("id", classroomIds);
  if (roomError) throw new AttendanceSendError("Could not check classroom access");
  if (rooms?.length !== classroomIds.length)
    throw new AttendanceSendError("Classroom access denied", 403);
  if (user.role === "teacher") {
    const { data: assigned, error } = await db
      .from("classroom_teacher_assignments")
      .select("classroom_id")
      .eq("teacher_user_id", user.userId)
      .in("classroom_id", classroomIds)
      .is("end_date", null);
    if (error) throw new AttendanceSendError("Could not check classroom access");
    if (new Set((assigned ?? []).map((r) => r.classroom_id)).size !== classroomIds.length)
      throw new AttendanceSendError("Classroom access denied", 403);
  } else if (user.role !== "admin") throw new AttendanceSendError("Classroom access denied", 403);

  const [school, roster, marks] = await Promise.all([
    db.from("schools").select("name").eq("id", user.schoolId).single(),
    db
      .from("student_classroom_enrollments")
      .select(
        "student_id, classroom_id, students!inner(id, school_id, first_name, last_name, archived_at)"
      )
      .in("classroom_id", classroomIds)
      .is("end_date", null)
      .eq("students.school_id", user.schoolId)
      .is("students.archived_at", null),
    db
      .from("attendance_records")
      .select(
        "id, student_id, classroom_id, status, comment, arrival_time, departure_time, half_day, updated_at, source_command_id"
      )
      .in("classroom_id", classroomIds)
      .eq("attendance_date", date),
  ]);
  if (school.error || roster.error || marks.error || !school.data)
    throw new AttendanceSendError("Could not load saved attendance");
  const enrollments = (roster.data ?? []) as unknown as Enrollment[];
  const byStudent = new Map(
    enrollments.map((e) => [`${e.classroom_id}:${e.student_id}`, e.students])
  );
  const saved = ((marks.data ?? []) as Mark[]).filter((m) =>
    byStudent.has(`${m.classroom_id}:${m.student_id}`)
  );
  const { data: links, error: linkError } = saved.length
    ? await db
        .from("student_guardians")
        .select("student_id, guardians!inner(id, school_id, email)")
        .in(
          "student_id",
          saved.map((m) => m.student_id)
        )
        .eq("receives_reports", true)
        .eq("guardians.school_id", user.schoolId)
    : { data: [], error: null };
  if (linkError) throw new AttendanceSendError("Could not load parent recipients");
  const addresses = new Map<string, Set<string>>();
  for (const link of (links ?? []) as unknown as Array<{
    student_id: string;
    guardians: { school_id: string; email: string | null };
  }>) {
    const email = link.guardians?.email?.trim().toLowerCase();
    if (
      link.guardians?.school_id !== user.schoolId ||
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      continue;
    const list = addresses.get(link.student_id) ?? new Set();
    list.add(email);
    addresses.set(link.student_id, list);
  }
  const roomNames = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const deliveries: AttendanceSendPlan["deliveries"] = [];
  for (const mark of saved) {
    const student = byStudent.get(`${mark.classroom_id}:${mark.student_id}`)!;
    for (const email of addresses.get(mark.student_id) ?? []) {
      deliveries.push({
        school_id: user.schoolId,
        classroom_id: mark.classroom_id,
        student_id: mark.student_id,
        attendance_date: date,
        recipient_email: email,
        snapshot_hash: hash(mark),
        payload: renderAttendanceEmail({
          to: email,
          studentName: `${student.first_name} ${student.last_name}`.trim(),
          schoolName: school.data.name,
          classroomName: roomNames.get(mark.classroom_id) ?? "Classroom",
          date,
          status: mark.status,
          comment: mark.comment,
          arrivalTime: mark.arrival_time,
          departureTime: mark.departure_time,
          halfDay: mark.half_day,
          appUrl,
        }),
      });
    }
  }
  deliveries.sort((a, b) =>
    `${a.classroom_id}:${a.student_id}:${a.recipient_email}`.localeCompare(
      `${b.classroom_id}:${b.student_id}:${b.recipient_email}`
    )
  );
  return {
    confirmation: hash({
      date,
      classroomIds: [...classroomIds].sort(),
      marks: [...saved].sort((a, b) => a.id.localeCompare(b.id)),
      deliveries,
    }),
    present: saved.filter((m) => m.status === "present").length,
    absent: saved.filter((m) => m.status === "absent").length,
    unmarked: enrollments.length - saved.length,
    withoutEmail: saved.filter((m) => !addresses.get(m.student_id)?.size).length,
    deliveries,
  };
}

export type AttendanceSendResult = {
  sent: number;
  alreadySent: number;
  failed: number;
  pending: number;
  needsReview: number;
};

/** Atomic leases stop concurrent sends; provider keys cover a crash after acceptance. */
export async function dispatchAttendancePlan(
  db: Db,
  plan: AttendanceSendPlan
): Promise<AttendanceSendResult> {
  const result: AttendanceSendResult = {
    sent: 0,
    alreadySent: 0,
    failed: 0,
    pending: 0,
    needsReview: 0,
  };
  let lastAttemptAt = 0;
  for (const item of plan.deliveries) {
    const { data: latest, error: latestError } = await db
      .from("attendance_parent_deliveries")
      .select("id, status, attempts, first_attempt_at, claimed_at, payload")
      .eq("school_id", item.school_id)
      .eq("classroom_id", item.classroom_id)
      .eq("student_id", item.student_id)
      .eq("attendance_date", item.attendance_date)
      .eq("recipient_email", item.recipient_email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      result.failed++;
      continue;
    }
    // No-op register saves must reuse the last delivery even though command IDs
    // and timestamps changed. A real content change gets a new delivery key;
    // chaining to the previous delivery also preserves corrections A → B → A.
    let delivery = latest?.payload?.text === item.payload.text ? latest : null;
    if (!delivery) {
      const queuedItem = {
        ...item,
        snapshot_hash: hash({ previousDeliveryId: latest?.id ?? null, text: item.payload.text }),
      };
      const { error: insertError } = await db
        .from("attendance_parent_deliveries")
        .upsert(queuedItem, {
          onConflict:
            "school_id,classroom_id,student_id,attendance_date,recipient_email,snapshot_hash",
          ignoreDuplicates: true,
        });
      if (insertError) {
        result.failed++;
        continue;
      }
      const { data: queued, error: lookupError } = await db
        .from("attendance_parent_deliveries")
        .select("id, status, attempts, first_attempt_at, claimed_at, payload")
        .eq("school_id", item.school_id)
        .eq("classroom_id", item.classroom_id)
        .eq("student_id", item.student_id)
        .eq("attendance_date", item.attendance_date)
        .eq("recipient_email", item.recipient_email)
        .eq("snapshot_hash", queuedItem.snapshot_hash)
        .single();
      if (lookupError || !queued) {
        result.failed++;
        continue;
      }
      delivery = queued;
    }
    if (delivery.status === "sent") {
      result.alreadySent++;
      continue;
    }
    const now = new Date();
    // Resend's keys expire after 24 hours. Older uncertain attempts need a person
    // to check provider delivery history rather than risking a duplicate email.
    if (
      delivery.first_attempt_at &&
      now.getTime() - new Date(delivery.first_attempt_at).getTime() > 23 * 60 * 60 * 1000
    ) {
      result.needsReview++;
      continue;
    }
    if (
      delivery.status === "sending" &&
      delivery.claimed_at &&
      now.getTime() - new Date(delivery.claimed_at).getTime() < 5 * 60 * 1000
    ) {
      result.pending++;
      continue;
    }
    const { data: claimed, error: claimError } = await db
      .from("attendance_parent_deliveries")
      .update({
        status: "sending",
        claimed_at: now.toISOString(),
        first_attempt_at: delivery.first_attempt_at ?? now.toISOString(),
        attempts: delivery.attempts + 1,
        last_error: null,
      })
      .eq("id", delivery.id)
      .eq("status", delivery.status)
      .eq("attempts", delivery.attempts)
      .select("id")
      .maybeSingle();
    if (claimError) {
      result.failed++;
      continue;
    }
    if (!claimed) {
      result.pending++;
      continue;
    }
    try {
      // Keep a classroom send within the provider's default two requests/second.
      const delay = 550 - (Date.now() - lastAttemptAt);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      lastAttemptAt = Date.now();
      const providerId = await sendAttendanceEmail(
        delivery.payload as AttendanceEmail,
        delivery.id
      );
      const { error } = await db
        .from("attendance_parent_deliveries")
        .update({
          status: "sent",
          provider_id: providerId,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", delivery.id);
      if (error) {
        result.pending++;
        continue;
      }
      result.sent++;
    } catch {
      const { error } = await db
        .from("attendance_parent_deliveries")
        .update({
          status: "failed",
          last_error: "Email acceptance was not confirmed; retry with the same delivery key.",
        })
        .eq("id", delivery.id);
      if (error) result.pending++;
      else result.failed++;
    }
  }
  return result;
}
