import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { runReportAgent, AgentAbortError } from "@/lib/reports/agent-loop";
import { SupabaseReportDataAdapter } from "@/lib/reports/supabase-adapter";
import { createClient } from "@/utils/supabase/server";
import { DraftReportRequestSchema } from "@/lib/schemas/report";

const RequestBodySchema = DraftReportRequestSchema.extend({
  classroomToken: z.string().regex(/^\[CLASSROOM_\d+\]$/),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const allowed = await requireTeacherForClassroom(input.classroomId);
  if (!allowed) {
    return NextResponse.json({ error: "Not assigned to classroom" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const adapter = new SupabaseReportDataAdapter(supabase);

  try {
    const result = await runReportAgent({
      studentToken: input.studentToken,
      studentRef: input.studentRef,
      classroomToken: input.classroomToken,
      classroomRef: input.classroomId,
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      adapter,
      anthropic: getAnthropic(),
      model: SONNET_MODEL,
    });

    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        student_id: input.studentRef,
        classroom_id: input.classroomId,
        report_type: input.reportType,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        report_date: input.periodEnd,
        status: "draft",
        title: result.draft.title,
        body: result.draft.draft_text,
        created_by_user_id: auth.user.userId,
      })
      .select("id")
      .single();
    if (error || !report) {
      return NextResponse.json(
        { error: "Failed to persist draft", details: error?.message },
        { status: 500 }
      );
    }

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "draft_report",
      target_table: "reports",
      target_id: report.id,
      metadata: {
        report_type: input.reportType,
        turns: result.turns,
        regenerations: result.regenerations,
      },
    });

    return NextResponse.json({
      reportId: report.id,
      draft: result.draft,
      references: result.references,
      meta: { turns: result.turns, regenerations: result.regenerations },
    });
  } catch (err) {
    if (err instanceof AgentAbortError) {
      await auditLog({
        actor_id: auth.user.userId,
        actor_role: auth.user.role,
        action: "draft_report_aborted",
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
