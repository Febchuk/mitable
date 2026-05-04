import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { runReportAgent, AgentAbortError } from "@/lib/reports/agent-loop";
import { SupabaseReportDataAdapter, IncrementalTokenizer } from "@/lib/reports/supabase-adapter";
import { DraftFromCaptureRequestSchema } from "@/lib/schemas/report";
import { detokenizeReportText } from "@/lib/reports/detokenize";

/**
 * Draft an existing reports row (created by /api/v1/reports). Pulls the row,
 * verifies the caller can see it, runs the agent, writes title + sections + body
 * back, and returns the updated row so the client can apply it without a refetch.
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
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, template_id, students!inner(school_id, first_name, last_name, preferred_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentRow = (
    report as unknown as {
      students: {
        school_id: string;
        first_name: string | null;
        last_name: string | null;
        preferred_name: string | null;
      } | null;
    }
  ).students;
  const studentSchool = studentRow?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }
  // Resolve display names. Two distinct values:
  //   - studentDisplay: used to seed [STUDENT_n] for de-tokenization. Just the
  //     first name (preferred if set, else legal). Teachers write "Max worked
  //     on math today", not "Maximilian Smith worked on math today".
  //   - studentFullName: used in the JSON payload's `studentName` for the top
  //     bar, where the full name belongs.
  const studentFirst = studentRow?.preferred_name || studentRow?.first_name || "";
  const studentLast = studentRow?.last_name || "";
  const studentDisplay = studentFirst.trim() || "Student";
  const studentFullName = `${studentFirst} ${studentLast}`.trim() || "Unknown";

  // Fetch classroom name so [CLASSROOM_n] also de-tokenizes properly.
  let classroomDisplay = "";
  {
    const { data: classroom } = await supabase
      .from("classrooms")
      .select("name")
      .eq("id", report.classroom_id as string)
      .maybeSingle();
    classroomDisplay = (classroom as { name: string | null } | null)?.name?.trim() ?? "";
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

  // Resolve template sections + guidance. If the report has no template_id,
  // the agent falls back to a single "Report" section (handled in agent-loop).
  let templateSections: { heading: string; guidance: string }[] = [];
  if (report.template_id) {
    const { data: tpl } = await supabase
      .from("report_templates")
      .select("sections, section_guidance, school_id")
      .eq("id", report.template_id as string)
      .maybeSingle();
    if (tpl && (tpl.school_id as string) === auth.user.schoolId) {
      const headings = (tpl.sections as string[] | null) ?? [];
      const guidance = (tpl.section_guidance as Record<string, string> | null) ?? {};
      templateSections = headings.map((heading) => ({
        heading,
        guidance: guidance[heading] ?? "",
      }));
    }
  }

  const tokenizer = new IncrementalTokenizer();
  const studentToken = tokenizer.studentToken(report.student_id as string, studentDisplay);
  const classroomToken = tokenizer.classroomToken(report.classroom_id as string, classroomDisplay);

  const periodStart = (report.period_start || report.report_date) as string;
  const periodEnd = (report.period_end || report.report_date) as string;

  // Pre-flight: if there's no captured context for this student in the
  // period AND the client didn't supply transcripts/notes, the agent has
  // nothing to draft from. Skip the agent run — the editor will render
  // the template's empty sections and the teacher fills them in (or
  // re-drafts later once observations exist).
  if (input.transcripts.length === 0 && input.notes.length === 0) {
    const studentRef = report.student_id as string;
    const periodEndDay = `${periodEnd}T23:59:59`;
    const [{ count: cmdCount }, { count: progCount }] = await Promise.all([
      supabase
        .from("commands")
        .select("id", { count: "exact", head: true })
        .eq("user_id", auth.user.userId)
        .gte("created_at", periodStart)
        .lte("created_at", periodEndDay),
      supabase
        .from("student_progress_history")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentRef)
        .gte("changed_at", periodStart)
        .lte("changed_at", periodEndDay),
    ]);
    if ((cmdCount ?? 0) === 0 && (progCount ?? 0) === 0) {
      await auditLog({
        actor_id: auth.user.userId,
        actor_role: auth.user.role,
        action: "report.draft_skipped_empty",
        target_table: "reports",
        target_id: id,
        metadata: { reason: "no commands or progress in period" },
      });
      return NextResponse.json({
        reportId: id,
        skipped: true,
        reason: "no_context",
      });
    }
  }

  const adapter = new SupabaseReportDataAdapter(supabase);
  const seedReferences = tokenizer.references();

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
      captureTranscripts: input.transcripts,
      captureNotes: input.notes,
      seedReferences,
      templateSections,
    });

    // De-tokenize the draft and shape it for the editor. We persist the
    // de-tokenized form because the editor reads `sections` JSON directly;
    // the reference set isn't stored alongside the row, so re-tokenizing on
    // every render isn't possible without redesign.
    const detokTitle = detokenizeReportText(result.draft.title, result.references);
    const editorSections = result.draft.sections.map((s, i) => {
      const detokHeading = detokenizeReportText(s.heading, result.references);
      const detokContent = detokenizeReportText(s.content, result.references);
      const slug =
        detokHeading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || `section-${i}`;
      return {
        id: `s-${i}-${slug}`,
        heading: detokHeading,
        paragraphs: [{ id: `p-${i}-1`, html: detokContent }],
      };
    });
    const concatenatedBody = editorSections
      .map((s) => `# ${s.heading}\n\n${s.paragraphs.map((p) => p.html).join("\n\n")}`)
      .join("\n\n");

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        title: detokTitle,
        sections: editorSections,
        body: concatenatedBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to persist draft", details: updateErr.message },
        { status: 500 }
      );
    }

    // Re-read the full row + student so the client can apply it directly.
    const { data: fresh, error: freshErr } = await supabase
      .from("reports")
      .select(
        "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id)"
      )
      .eq("id", id)
      .maybeSingle();
    if (freshErr || !fresh) {
      return NextResponse.json(
        { error: "Drafted but failed to re-read row", details: freshErr?.message },
        { status: 500 }
      );
    }
    const reportPayload = {
      id: fresh.id,
      studentId: fresh.student_id,
      studentName: studentFullName,
      classroomId: fresh.classroom_id,
      reportType: fresh.report_type,
      reportDate: fresh.report_date,
      periodStart: fresh.period_start,
      periodEnd: fresh.period_end,
      status: fresh.status,
      title: fresh.title,
      body: fresh.body,
      sections: fresh.sections,
      templateId: fresh.template_id,
      createdByUserId: fresh.created_by_user_id,
      approvedByUserId: fresh.approved_by_user_id,
      approvedAt: fresh.approved_at,
      sentAt: fresh.sent_at,
      createdAt: fresh.created_at,
      updatedAt: fresh.updated_at,
    };

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
        section_count: editorSections.length,
      },
    });

    return NextResponse.json({
      reportId: id,
      report: reportPayload,
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
