import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { runReportAgent, AgentAbortError } from "@/lib/reports/agent-loop";
import { SupabaseReportDataAdapter, IncrementalTokenizer } from "@/lib/reports/supabase-adapter";
import { DraftFromCaptureRequestSchema } from "@/lib/schemas/report";

/**
 * Draft an existing reports row (created by /api/v1/reports). Pulls the row,
 * verifies the caller can see it, runs the agent, writes title+body back.
 *
 * Body is optional client-derived context: transcripts (Whisper), notes (OCR),
 * tokenMap (fuzzy). All thrown away after the agent run; nothing persists.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = DraftFromCaptureRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Admin client to dodge the reports RLS recursion. School isolation is
  // enforced explicitly via the joined students.school_id check below.
  const supabase = createAdminClient();

  const { data: report, error: readErr } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, students!inner(school_id)"
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentSchool = (
    report as unknown as { students: { school_id: string } | null }
  ).students?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }
  if (report.status !== "draft") {
    return NextResponse.json(
      { error: "Report is not a draft", status: report.status },
      { status: 409 }
    );
  }

  const allowed = await requireTeacherForClassroom(report.classroom_id as string);
  if (!allowed) {
    return NextResponse.json({ error: "Not assigned to classroom" }, { status: 403 });
  }

  const tokenizer = new IncrementalTokenizer();
  const studentToken = tokenizer.studentToken(report.student_id as string, "");
  const classroomToken = tokenizer.classroomToken(report.classroom_id as string, "");

  const periodStart = (report.period_start || report.report_date) as string;
  const periodEnd = (report.period_end || report.report_date) as string;

  const adapter = new SupabaseReportDataAdapter(supabase);

  try {
    const result = await runReportAgent({
      studentToken,
      studentRef: report.student_id as string,
      classroomToken,
      classroomRef: report.classroom_id as string,
      reportType: report.report_type as "daily" | "major" | "incident",
      periodStart,
      periodEnd,
      adapter,
      anthropic: getAnthropic(),
      model: SONNET_MODEL,
    });

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        title: result.draft.title,
        body: result.draft.draft_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to persist draft", details: updateErr.message },
        { status: 500 }
      );
    }

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "report.draft_from_capture",
      target_table: "reports",
      target_id: id,
      metadata: {
        report_type: report.report_type,
        turns: result.turns,
        regenerations: result.regenerations,
        capture_transcripts: input.transcripts.length,
        capture_notes: input.notes.length,
        capture_tokens: input.tokenMap.length,
      },
    });

    return NextResponse.json({
      reportId: id,
      draft: result.draft,
      references: result.references,
      meta: { turns: result.turns, regenerations: result.regenerations },
    });
  } catch (err) {
    if (err instanceof AgentAbortError) {
      await auditLog({
        actor_id: auth.user.userId,
        actor_role: auth.user.role,
        action: "report.draft_from_capture_aborted",
        target_id: id,
        metadata: { reason: err.reason, message: err.message },
      });
      return NextResponse.json(
        { error: "Agent aborted", reason: err.reason, message: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Internal error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
