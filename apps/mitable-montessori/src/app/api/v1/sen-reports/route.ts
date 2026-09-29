import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { resolveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { auditLog } from "@/lib/audit/log";
import { createClient } from "@/utils/supabase/server";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const SaveSenReportSchema = z.object({
  classroomId: z.string().uuid(),
  groupId: z.string().uuid(),
  studentId: z.string().uuid(),
  reportDate: DateSchema,
  remarks: z.string().trim().max(4000).optional(),
  scores: z
    .array(
      z.object({
        metricId: z.string().uuid(),
        score: z.number().int().min(1).max(5),
      })
    )
    .min(1)
    .max(40),
});

type ScoreRow = { metric_id: string; score: number };

function todayInIsoDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroomId") ?? undefined;
  const requestedDate = url.searchParams.get("date") ?? todayInIsoDate();
  if (!DateSchema.safeParse(requestedDate).success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const classroom = await resolveClassroomForCurrentUser(classroomId);
  if (!classroom) return NextResponse.json({ error: "No active classroom" }, { status: 403 });

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: group, error: groupError } = await supabase
    .from("sen_report_groups")
    .select("id, name, template_id")
    .eq("classroom_id", classroom.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  if (!group) {
    return NextResponse.json({
      classroom,
      date: requestedDate,
      group: null,
      metrics: [],
      students: [],
    });
  }

  const [{ data: metrics, error: metricsError }, { data: memberRows, error: membersError }] =
    await Promise.all([
      supabase
        .from("sen_report_metrics")
        .select("id, section, metric_key, label, sort_order, scale_type, score_labels")
        .eq("template_id", group.template_id)
        .eq("is_active", true)
        .order("section")
        .order("sort_order"),
      supabase
        .from("sen_report_group_members")
        .select("student_id, students!inner(first_name, last_name, preferred_name)")
        .eq("sen_report_group_id", group.id)
        .lte("joined_on", requestedDate)
        .or(`left_on.is.null,left_on.gte.${requestedDate}`),
    ]);
  if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 });
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const studentIds = (memberRows ?? []).map((row) => row.student_id as string);
  const { data: reportRows, error: reportsError } = studentIds.length
    ? await supabase
        .from("sen_daily_reports")
        .select("id, student_id, remarks, sen_daily_report_scores(metric_id, score)")
        .eq("sen_report_group_id", group.id)
        .eq("report_date", requestedDate)
        .in("student_id", studentIds)
    : { data: [], error: null };
  if (reportsError) return NextResponse.json({ error: reportsError.message }, { status: 500 });

  const reportsByStudent = new Map(
    (reportRows ?? []).map((report) => [
      report.student_id as string,
      {
        id: report.id as string,
        remarks: (report.remarks as string | null) ?? "",
        scores: ((report.sen_daily_report_scores ?? []) as ScoreRow[]).map((score) => ({
          metricId: score.metric_id,
          score: score.score,
        })),
      },
    ])
  );

  const students = (memberRows ?? [])
    .map((member) => {
      const joined = member.students as
        | { first_name: string; last_name: string; preferred_name: string | null }
        | Array<{ first_name: string; last_name: string; preferred_name: string | null }>
        | null;
      const student = Array.isArray(joined) ? joined[0] : joined;
      if (!student) return null;
      return {
        id: member.student_id as string,
        name: student.preferred_name?.trim() || `${student.first_name} ${student.last_name}`.trim(),
        report: reportsByStudent.get(member.student_id as string) ?? null,
      };
    })
    .filter((student): student is NonNullable<typeof student> => student !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    classroom,
    date: requestedDate,
    group: { id: group.id, name: group.name },
    metrics: metrics ?? [],
    students,
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = SaveSenReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid SEN report", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  if (new Set(input.scores.map((score) => score.metricId)).size !== input.scores.length) {
    return NextResponse.json({ error: "Each SEN item can only be scored once" }, { status: 400 });
  }

  const classroom = await resolveClassroomForCurrentUser(input.classroomId);
  if (!classroom) return NextResponse.json({ error: "No active classroom" }, { status: 403 });

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: group, error: groupError } = await supabase
    .from("sen_report_groups")
    .select("id, template_id")
    .eq("id", input.groupId)
    .eq("classroom_id", classroom.id)
    .eq("is_active", true)
    .maybeSingle();
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
  if (!group) return NextResponse.json({ error: "SEN group not found" }, { status: 404 });

  const { data: metrics, error: metricsError } = await supabase
    .from("sen_report_metrics")
    .select("id")
    .eq("template_id", group.template_id)
    .eq("is_active", true);
  if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 });
  const expectedMetricIds = new Set((metrics ?? []).map((metric) => metric.id as string));
  const suppliedMetricIds = new Set(input.scores.map((score) => score.metricId));
  if (
    expectedMetricIds.size !== suppliedMetricIds.size ||
    [...expectedMetricIds].some((metricId) => !suppliedMetricIds.has(metricId))
  ) {
    return NextResponse.json(
      { error: "Score every SEN item before saving the report" },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("sen_daily_reports")
    .select("id")
    .eq("sen_report_group_id", group.id)
    .eq("student_id", input.studentId)
    .eq("report_date", input.reportDate)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const reportPayload = {
    remarks: input.remarks?.trim() || null,
    updated_by_user_id: auth.user.userId,
  };
  const reportResult = existing
    ? await supabase
        .from("sen_daily_reports")
        .update(reportPayload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase
        .from("sen_daily_reports")
        .insert({
          ...reportPayload,
          school_id: auth.user.schoolId,
          sen_report_group_id: group.id,
          student_id: input.studentId,
          report_date: input.reportDate,
          created_by_user_id: auth.user.userId,
        })
        .select("id")
        .single();
  if (reportResult.error) {
    return NextResponse.json({ error: reportResult.error.message }, { status: 500 });
  }

  const reportId = reportResult.data.id as string;
  const { error: scoresError } = await supabase.from("sen_daily_report_scores").upsert(
    input.scores.map((score) => ({
      sen_daily_report_id: reportId,
      metric_id: score.metricId,
      score: score.score,
    })),
    { onConflict: "sen_daily_report_id,metric_id" }
  );
  if (scoresError) return NextResponse.json({ error: scoresError.message }, { status: 500 });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "sen_daily_report_saved",
    target_table: "sen_daily_reports",
    target_id: reportId,
    metadata: {
      classroom_id: classroom.id,
      sen_report_group_id: group.id,
      student_id: input.studentId,
      report_date: input.reportDate,
    },
  });

  return NextResponse.json({ ok: true, id: reportId });
}
