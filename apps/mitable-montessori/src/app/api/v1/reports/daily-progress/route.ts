import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import {
  isToddlerClassroomCode,
  listTeacherClassroomsForCurrentUser,
} from "@/lib/app/active-classroom";
import { drainPendingReports, StubEmailSender } from "@/lib/admin/email-worker";
import { ResendEmailSender } from "@/lib/email/resend";
import {
  dailyProgressReason,
  type DailyProgressBatchResult,
  type DailyProgressReportChild,
  type DailyProgressReportStatus,
  type DailyProgressReportSummary,
} from "@/lib/reports/daily-progress-batch";
import { buildDefaultReportSections } from "@/lib/reports/default-template";
import { sendReport } from "@/lib/reports/workflow";
import { REPORTABLE_PROGRESS_STATUSES } from "@/lib/progress/marking-schemas";
import { createAdminClient } from "@/utils/supabase/admin";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UtcOffsetSchema = z.coerce.number().int().min(-840).max(840);
const SendBatchSchema = z.object({
  reportDate: DateSchema,
  utcOffsetMinutes: UtcOffsetSchema,
  studentIds: z.array(z.string().uuid()).min(1).max(100),
});

type Classroom = { id: string; name: string };
type RosterStudent = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  classroomId: string;
};
type GuardianRecipient = { id: string; email: string };
type ExistingReport = {
  id: string;
  studentId: string;
  classroomId: string;
  status: DailyProgressReportStatus;
  updatedAt: string;
};

function studentName(student: RosterStudent): string {
  return `${student.preferredName || student.firstName} ${student.lastName}`.trim();
}

function reportWindow(reportDate: string, utcOffsetMinutes: number) {
  const [year, month, day] = reportDate.split("-").map(Number);
  // Date#getTimezoneOffset is UTC - local time, so adding it to local midnight
  // gives the exact UTC instant at which the teacher's day starts.
  const startMs = Date.UTC(year, month - 1, day) + utcOffsetMinutes * 60_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000 - 1).toISOString(),
  };
}

async function loadScope(schoolId: string): Promise<{
  classrooms: Classroom[];
  students: RosterStudent[];
}> {
  const assigned = (await listTeacherClassroomsForCurrentUser()).filter(
    (classroom) => !isToddlerClassroomCode(classroom.code)
  );
  const classrooms = assigned.map(({ id, name }) => ({ id, name }));
  if (classrooms.length === 0) return { classrooms: [], students: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_classroom_enrollments")
    .select(
      "classroom_id, students!inner(id, first_name, last_name, preferred_name, school_id, archived_at)"
    )
    .in(
      "classroom_id",
      classrooms.map((classroom) => classroom.id)
    )
    .is("end_date", null)
    .eq("students.school_id", schoolId)
    .is("students.archived_at", null);
  if (error) throw new Error(error.message);

  const students: RosterStudent[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const relation = row as unknown as {
      classroom_id: string;
      students:
        | {
            id: string;
            first_name: string;
            last_name: string;
            preferred_name: string | null;
          }
        | Array<{
            id: string;
            first_name: string;
            last_name: string;
            preferred_name: string | null;
          }>
        | null;
    };
    const child = Array.isArray(relation.students) ? relation.students[0] : relation.students;
    if (!child || seen.has(child.id)) continue;
    seen.add(child.id);
    students.push({
      id: child.id,
      firstName: child.first_name,
      lastName: child.last_name,
      preferredName: child.preferred_name,
      classroomId: relation.classroom_id,
    });
  }
  return { classrooms, students };
}

async function loadProgressCounts(
  studentIds: string[],
  reportDate: string,
  utcOffsetMinutes: number
) {
  const counts = new Map<string, { progressCount: number; noteCount: number }>();
  if (studentIds.length === 0) return counts;
  const supabase = createAdminClient();
  const window = reportWindow(reportDate, utcOffsetMinutes);
  const { data, error } = await supabase
    .from("student_progress_history")
    .select("student_id, curriculum_subtopic_id, new_status, comment, changed_at")
    .in("student_id", studentIds)
    .in("new_status", [...REPORTABLE_PROGRESS_STATUSES])
    .gte("changed_at", window.start)
    .lte("changed_at", window.end)
    .order("changed_at", { ascending: true });
  if (error) throw new Error(error.message);

  const latestByCell = new Map<string, { studentId: string; hasNote: boolean }>();
  for (const row of data ?? []) {
    const r = row as {
      student_id: string;
      curriculum_subtopic_id: string;
      comment: string | null;
    };
    latestByCell.set(`${r.student_id}:${r.curriculum_subtopic_id}`, {
      studentId: r.student_id,
      hasNote: Boolean(r.comment?.trim()),
    });
  }
  for (const value of latestByCell.values()) {
    const current = counts.get(value.studentId) ?? { progressCount: 0, noteCount: 0 };
    current.progressCount += 1;
    if (value.hasNote) current.noteCount += 1;
    counts.set(value.studentId, current);
  }
  return counts;
}

async function loadGuardianRecipients(studentIds: string[]) {
  const recipients = new Map<string, GuardianRecipient[]>();
  if (studentIds.length === 0) return recipients;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_guardians")
    .select("student_id, guardian_id, guardians(id, email)")
    .in("student_id", studentIds)
    .eq("receives_reports", true);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const r = row as unknown as {
      student_id: string;
      guardian_id: string;
      guardians:
        | { id: string; email: string | null }
        | Array<{ id: string; email: string | null }>
        | null;
    };
    const guardian = Array.isArray(r.guardians) ? r.guardians[0] : r.guardians;
    if (!guardian?.email?.trim()) continue;
    const current = recipients.get(r.student_id) ?? [];
    current.push({ id: r.guardian_id, email: guardian.email.trim() });
    recipients.set(r.student_id, current);
  }
  return recipients;
}

async function loadExistingReports(
  studentIds: string[],
  classroomIds: string[],
  reportDate: string
) {
  const byStudent = new Map<string, ExistingReport>();
  if (studentIds.length === 0) return byStudent;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, student_id, classroom_id, status, updated_at")
    .in("student_id", studentIds)
    .in("classroom_id", classroomIds)
    .eq("report_type", "daily")
    .eq("report_date", reportDate)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const report: ExistingReport = {
      id: row.id as string,
      studentId: row.student_id as string,
      classroomId: row.classroom_id as string,
      status: row.status as DailyProgressReportStatus,
      updatedAt: row.updated_at as string,
    };
    const current = byStudent.get(report.studentId);
    // A sent report always wins so a later accidental draft cannot cause a duplicate send.
    if (!current || report.status === "sent") byStudent.set(report.studentId, report);
  }
  return byStudent;
}

async function buildSummary(schoolId: string, reportDate: string, utcOffsetMinutes: number) {
  const scope = await loadScope(schoolId);
  const studentIds = scope.students.map((student) => student.id);
  const classroomIds = scope.classrooms.map((classroom) => classroom.id);
  const [progress, recipients, reports] = await Promise.all([
    loadProgressCounts(studentIds, reportDate, utcOffsetMinutes),
    loadGuardianRecipients(studentIds),
    loadExistingReports(studentIds, classroomIds, reportDate),
  ]);
  const classroomNameById = new Map(scope.classrooms.map((room) => [room.id, room.name] as const));
  const children: DailyProgressReportChild[] = scope.students.map((student) => {
    const activity = progress.get(student.id) ?? { progressCount: 0, noteCount: 0 };
    const report = reports.get(student.id) ?? null;
    const guardianCount = recipients.get(student.id)?.length ?? 0;
    return {
      studentId: student.id,
      studentName: studentName(student),
      classroomId: student.classroomId,
      classroomName: classroomNameById.get(student.classroomId) ?? "Classroom",
      ...activity,
      guardianCount,
      reportId: report?.id ?? null,
      reportStatus: report?.status ?? null,
      ...dailyProgressReason({
        progressCount: activity.progressCount,
        guardianCount,
        reportStatus: report?.status ?? null,
      }),
    };
  });

  const summary: DailyProgressReportSummary = {
    reportDate,
    classrooms: scope.classrooms.map((room) => ({
      classroomId: room.id,
      classroomName: room.name,
      children: children
        .filter((child) => child.classroomId === room.id)
        .sort((a, b) => a.studentName.localeCompare(b.studentName)),
    })),
    readyCount: children.filter((child) => child.sendable).length,
    sentCount: children.filter((child) => child.reason === "sent").length,
  };
  return { summary, scope, progress, recipients, reports };
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher") {
    return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  }
  const parsedDate = DateSchema.safeParse(new URL(req.url).searchParams.get("date"));
  const parsedOffset = UtcOffsetSchema.safeParse(
    new URL(req.url).searchParams.get("utcOffsetMinutes")
  );
  if (!parsedDate.success || !parsedOffset.success) {
    return NextResponse.json(
      { error: "A valid report date and time zone are required" },
      { status: 400 }
    );
  }
  try {
    const { summary } = await buildSummary(auth.user.schoolId, parsedDate.data, parsedOffset.data);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("daily progress report summary failed", error);
    return NextResponse.json({ error: "Couldn't load today's reports" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher") {
    return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  }
  const parsed = SendBatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid daily report selection" }, { status: 400 });
  }
  const hasResendKey = Boolean(process.env.RESEND_API_KEY?.trim());
  if (!hasResendKey && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Email delivery is not configured. Ask an admin to set RESEND_API_KEY." },
      { status: 503 }
    );
  }

  try {
    const { summary, scope, progress, recipients, reports } = await buildSummary(
      auth.user.schoolId,
      parsed.data.reportDate,
      parsed.data.utcOffsetMinutes
    );
    const allowedById = new Map(
      summary.classrooms.flatMap((room) => room.children).map((child) => [child.studentId, child])
    );
    const studentById = new Map(scope.students.map((student) => [student.id, student] as const));
    const selectedIds = [...new Set(parsed.data.studentIds)];
    const supabase = createAdminClient();
    const sender = hasResendKey ? new ResendEmailSender() : new StubEmailSender();
    const results: DailyProgressBatchResult[] = [];

    for (const studentId of selectedIds) {
      const child = allowedById.get(studentId);
      const student = studentById.get(studentId);
      if (!child || !student) {
        results.push({
          studentId,
          studentName: "Child",
          status: "failed",
          error: "Not in your assigned classrooms",
        });
        continue;
      }
      if (!child.sendable) {
        results.push({
          studentId,
          studentName: child.studentName,
          status: "skipped",
          error: child.reason,
        });
        continue;
      }

      try {
        const guardianRows = recipients.get(studentId) ?? [];
        const existing = reports.get(studentId) ?? null;
        let reportId = existing?.id ?? null;

        if (!existing || existing.status === "draft" || existing.status === "changes_requested") {
          const exactWindow = reportWindow(parsed.data.reportDate, parsed.data.utcOffsetMinutes);
          const built = await buildDefaultReportSections(supabase, {
            classroomId: student.classroomId,
            studentId,
            periodStart: parsed.data.reportDate,
            periodEnd: parsed.data.reportDate,
            reportingPeriod: "daily",
            exactWindow,
          });
          const noon = new Date(`${parsed.data.reportDate}T12:00:00Z`);
          const firstName = student.preferredName || student.firstName || "Student";
          const title = `${firstName} — ${noon.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}`;
          if (existing) {
            const { error } = await supabase
              .from("reports")
              .update({
                sections: built.sections,
                section_meta: built.sectionMeta,
                section_guidance: built.sectionGuidance,
                body: null,
                title,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
          } else {
            const { data: inserted, error } = await supabase
              .from("reports")
              .insert({
                student_id: studentId,
                classroom_id: student.classroomId,
                report_type: "daily",
                report_date: parsed.data.reportDate,
                period_start: parsed.data.reportDate,
                period_end: parsed.data.reportDate,
                reporting_period: "daily",
                status: "draft",
                title,
                body: null,
                sections: built.sections,
                template_id: null,
                section_meta: built.sectionMeta,
                section_guidance: built.sectionGuidance,
                created_by_user_id: auth.user.userId,
              })
              .select("id")
              .single();
            if (error || !inserted) throw new Error(error?.message ?? "Couldn't create report");
            reportId = inserted.id as string;
            await auditLog({
              actor_id: auth.user.userId,
              actor_role: auth.user.role,
              action: "report.create",
              target_table: "reports",
              target_id: reportId,
              metadata: {
                kind: "Daily",
                classroom_id: student.classroomId,
                source: "progress_batch",
                progress_count: progress.get(studentId)?.progressCount ?? 0,
              },
            });
          }
        }

        if (!reportId) throw new Error("Couldn't prepare report");
        const guardianEmailMap = Object.fromEntries(guardianRows.map((g) => [g.id, g.email]));
        await sendReport(
          { supabase, reportId, actorUserId: auth.user.userId },
          guardianRows.map((g) => g.id),
          guardianEmailMap
        );
        await auditLog({
          actor_id: auth.user.userId,
          actor_role: auth.user.role,
          action: "send_report",
          target_table: "reports",
          target_id: reportId,
          metadata: { recipient_count: guardianRows.length, source: "progress_batch" },
        });
        const drain = await drainPendingReports(supabase, sender, { reportId });
        if (drain.failed > 0) {
          throw new Error(
            drain.sent > 0
              ? `${drain.sent} delivered, ${drain.failed} failed`
              : "Email delivery failed"
          );
        }
        results.push({ studentId, studentName: child.studentName, reportId, status: "sent" });
      } catch (error) {
        results.push({
          studentId,
          studentName: child.studentName,
          status: "failed",
          error: error instanceof Error ? error.message : "Couldn't send report",
        });
      }
    }

    const sentCount = results.filter((result) => result.status === "sent").length;
    const failedCount = results.filter((result) => result.status === "failed").length;
    return NextResponse.json({ results, sentCount, failedCount });
  } catch (error) {
    console.error("daily progress report batch failed", error);
    return NextResponse.json({ error: "Couldn't prepare today's reports" }, { status: 500 });
  }
}
