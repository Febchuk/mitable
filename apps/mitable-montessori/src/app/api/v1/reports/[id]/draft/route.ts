import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { runReportAgent, AgentAbortError, type AgentRunOutput } from "@/lib/reports/agent-loop";
import { SupabaseReportDataAdapter } from "@/lib/reports/supabase-adapter";
import { DraftFromCaptureRequestSchema } from "@/lib/schemas/report";
import { detokenizeReportText } from "@/lib/reports/detokenize";
import { fetchTemplateLogoUrl } from "@/lib/queries/reports";
import type { SectionMeta } from "@/lib/report-templates/sections";
import {
  normalizeSectionHtmlForTemplate,
  plainTextToReportParagraphHtml,
} from "@/lib/reports/template-field-payload";

function sectionSlug(heading: string, i: number): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `section-${i}`
  );
}

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
  /** Full template order (includes hardcoded — those are merged server-side, not sent to the agent). */
  let templateHeadings: string[] = [];
  let sectionGuidance: Record<string, string> = {};
  let templateSections: { heading: string; guidance: string }[] = [];
  let writingStyle = "";
  let templateSectionMeta: SectionMeta = {};
  if (report.template_id) {
    const { data: tpl } = await supabase
      .from("report_templates")
      .select("sections, section_guidance, school_id, writing_style, section_meta")
      .eq("id", report.template_id as string)
      .maybeSingle();
    if (tpl && (tpl.school_id as string) === auth.user.schoolId) {
      const headings = (tpl.sections as string[] | null) ?? [];
      const guidance = (tpl.section_guidance as Record<string, string> | null) ?? {};
      templateSectionMeta = (tpl.section_meta as SectionMeta | null) ?? {};
      templateHeadings = headings;
      sectionGuidance = guidance;
      templateSections = headings
        .filter((heading) => templateSectionMeta[heading]?.type !== "hardcoded")
        .map((heading) => ({
          heading,
          guidance: guidance[heading] ?? "",
        }));
      writingStyle = ((tpl.writing_style as string | null) ?? "").trim();
    }
  }

  // Seed the agent's reference set with every student the client tokenized
  // from the transcript (NOT just the active one) — otherwise the validator
  // sees their tokens as "unknown" and rejects the draft until the agent
  // budget is exhausted, returning 502. tokenMap entries come from the
  // client's fuzzy-match step and are trusted only after we re-fetch each
  // student from this caller's school.
  const studentIdsToFetch = new Set<string>([report.student_id as string]);
  for (const entry of input.tokenMap) studentIdsToFetch.add(entry.studentId);

  const { data: rosterRows } = await supabase
    .from("students")
    .select("id, first_name, preferred_name, school_id")
    .in("id", Array.from(studentIdsToFetch))
    .eq("school_id", auth.user.schoolId);

  const firstNameById = new Map<string, string>();
  for (const r of (rosterRows ?? []) as Array<{
    id: string;
    first_name: string | null;
    preferred_name: string | null;
  }>) {
    const name = (r.preferred_name || r.first_name || "").trim() || "Student";
    firstNameById.set(r.id, name);
  }

  // Build the explicit reference set. Each ref pairs a token with the display
  // name we'll de-tokenize to AND the name the validator forbids leaking.
  type SeedRef = {
    id: string;
    token: string;
    display: string;
    kind: "student" | "classroom";
  };
  const seedRefs: SeedRef[] = [];
  const usedTokens = new Set<string>();

  for (const entry of input.tokenMap) {
    const firstName = firstNameById.get(entry.studentId);
    if (!firstName) continue; // student not in caller's school — drop silently
    seedRefs.push({
      id: entry.studentId,
      token: entry.token,
      display: firstName,
      kind: "student",
    });
    usedTokens.add(entry.token);
  }

  // Active student: respect whatever token the client gave him in tokenMap
  // (so the agent's kickoff aligns with the transcript). Otherwise pick the
  // next free [STUDENT_n] slot. This is the case when Whisper mistranscribed
  // the active student's name and the fuzzy matcher didn't catch him.
  const activeMapEntry = input.tokenMap.find((t) => t.studentId === report.student_id);
  let studentToken: string;
  if (activeMapEntry) {
    studentToken = activeMapEntry.token;
  } else {
    let n = 1;
    while (usedTokens.has(`[STUDENT_${n}]`)) n++;
    studentToken = `[STUDENT_${n}]`;
    seedRefs.push({
      id: report.student_id as string,
      token: studentToken,
      display: studentDisplay,
      kind: "student",
    });
    usedTokens.add(studentToken);
  }

  const classroomToken = "[CLASSROOM_0]";
  seedRefs.push({
    id: report.classroom_id as string,
    token: classroomToken,
    display: classroomDisplay || "this classroom",
    kind: "classroom",
  });

  const periodStart = (report.period_start || report.report_date) as string;
  const periodEnd = (report.period_end || report.report_date) as string;

  // Pre-flight: if there's no captured context for this student in the
  // period AND the client didn't supply transcripts/notes, the agent has
  // nothing to draft from. Skip the agent run — the editor will render
  // the template's empty sections and the teacher fills them in (or
  // re-drafts later once observations exist).
  // Capture-only skips this: the teacher explicitly asked not to use
  // tracked progress, so we still run the agent (template-only or capture-only).
  if (!input.captureOnly && input.transcripts.length === 0 && input.notes.length === 0) {
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
      let skipReportPayload: Record<string, unknown> | null = null;
      if (
        templateHeadings.length > 0 &&
        templateHeadings.some((h) => templateSectionMeta[h]?.type === "hardcoded")
      ) {
        const editorSections = templateHeadings.map((heading, i) => {
          const slug = sectionSlug(heading, i);
          if (templateSectionMeta[heading]?.type === "hardcoded") {
            return {
              id: `s-${i}-${slug}`,
              heading,
              paragraphs: [
                {
                  id: `p-${i}-1`,
                  html: plainTextToReportParagraphHtml(sectionGuidance[heading] ?? ""),
                },
              ],
            };
          }
          return {
            id: `s-${i}-${slug}`,
            heading,
            paragraphs: [{ id: `p-${i}-1`, html: "" }],
          };
        });
        const concatenatedBody = editorSections
          .map((s) => `# ${s.heading}\n\n${s.paragraphs.map((p) => p.html).join("\n\n")}`)
          .join("\n\n");
        const { error: skipUpdErr } = await supabase
          .from("reports")
          .update({
            sections: editorSections,
            body: concatenatedBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (!skipUpdErr) {
          const { data: freshSkip, error: freshSkipErr } = await supabase
            .from("reports")
            .select(
              "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id), report_templates(section_meta, school_id)"
            )
            .eq("id", id)
            .maybeSingle();
          if (!freshSkipErr && freshSkip) {
            const templateLogoUrl = await fetchTemplateLogoUrl(
              supabase,
              freshSkip.template_id as string | null,
              auth.user.schoolId
            );
            const freshTplSkip = (
              freshSkip as unknown as {
                report_templates: { section_meta: unknown; school_id: string } | null;
              }
            ).report_templates;
            const responseTemplateMeta: SectionMeta =
              freshTplSkip && freshTplSkip.school_id === auth.user.schoolId
                ? ((freshTplSkip.section_meta as SectionMeta | null) ?? {})
                : templateSectionMeta;
            skipReportPayload = {
              id: freshSkip.id,
              studentId: freshSkip.student_id,
              studentName: studentFullName,
              classroomId: freshSkip.classroom_id,
              reportType: freshSkip.report_type,
              reportDate: freshSkip.report_date,
              periodStart: freshSkip.period_start,
              periodEnd: freshSkip.period_end,
              status: freshSkip.status,
              title: freshSkip.title,
              body: freshSkip.body,
              sections: freshSkip.sections,
              templateId: freshSkip.template_id,
              templateSectionMeta: responseTemplateMeta,
              templateLogoUrl,
              createdByUserId: freshSkip.created_by_user_id,
              approvedByUserId: freshSkip.approved_by_user_id,
              approvedAt: freshSkip.approved_at,
              sentAt: freshSkip.sent_at,
              createdAt: freshSkip.created_at,
              updatedAt: freshSkip.updated_at,
            };
          }
        }
      }

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
        ...(skipReportPayload ? { report: skipReportPayload } : {}),
      });
    }
  }

  const adapter = new SupabaseReportDataAdapter(supabase);
  const seedReferences = { refs: seedRefs };

  try {
    let agentResult: AgentRunOutput | null = null;
    let detokTitle: string | null = null;
    let editorSections: Array<{
      id: string;
      heading: string;
      paragraphs: { id: string; html: string }[];
    }>;

    const headingsForAgent = templateHeadings.filter(
      (h) => templateSectionMeta[h]?.type !== "hardcoded"
    );

    if (templateHeadings.length === 0) {
      agentResult = await runReportAgent({
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
        writingStyle,
        captureOnly: input.captureOnly,
      });
      detokTitle = detokenizeReportText(agentResult.draft.title, agentResult.references);
      editorSections = agentResult.draft.sections.map((s, i) => {
        const detokHeading = detokenizeReportText(s.heading, agentResult!.references);
        const detokContent = detokenizeReportText(s.content, agentResult!.references);
        const slug = sectionSlug(detokHeading, i);
        const normalizedHtml = normalizeSectionHtmlForTemplate(
          detokHeading,
          detokContent,
          templateSectionMeta
        );
        return {
          id: `s-${i}-${slug}`,
          heading: detokHeading,
          paragraphs: [{ id: `p-${i}-1`, html: normalizedHtml }],
        };
      });
    } else if (headingsForAgent.length === 0) {
      editorSections = templateHeadings.map((heading, i) => {
        const slug = sectionSlug(heading, i);
        return {
          id: `s-${i}-${slug}`,
          heading,
          paragraphs: [
            {
              id: `p-${i}-1`,
              html: plainTextToReportParagraphHtml(sectionGuidance[heading] ?? ""),
            },
          ],
        };
      });
      detokTitle = null;
    } else {
      agentResult = await runReportAgent({
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
        writingStyle,
        captureOnly: input.captureOnly,
      });
      detokTitle = detokenizeReportText(agentResult.draft.title, agentResult.references);
      let agentIdx = 0;
      editorSections = templateHeadings.map((heading, i) => {
        const slug = sectionSlug(heading, i);
        if (templateSectionMeta[heading]?.type === "hardcoded") {
          return {
            id: `s-${i}-${slug}`,
            heading,
            paragraphs: [
              {
                id: `p-${i}-1`,
                html: plainTextToReportParagraphHtml(sectionGuidance[heading] ?? ""),
              },
            ],
          };
        }
        const s = agentResult!.draft.sections[agentIdx++];
        if (!s) {
          throw new Error("Draft sections misaligned with template (missing agent block)");
        }
        const detokContent = detokenizeReportText(s.content, agentResult!.references);
        const normalizedHtml = normalizeSectionHtmlForTemplate(
          heading,
          detokContent,
          templateSectionMeta
        );
        return {
          id: `s-${i}-${slug}`,
          heading,
          paragraphs: [{ id: `p-${i}-1`, html: normalizedHtml }],
        };
      });
      if (agentIdx !== agentResult.draft.sections.length) {
        throw new Error("Draft sections misaligned with template (extra agent block)");
      }
    }

    const concatenatedBody = editorSections
      .map((s) => `# ${s.heading}\n\n${s.paragraphs.map((p) => p.html).join("\n\n")}`)
      .join("\n\n");

    const updateRow: {
      title?: string;
      sections: typeof editorSections;
      body: string;
      updated_at: string;
    } = {
      sections: editorSections,
      body: concatenatedBody,
      updated_at: new Date().toISOString(),
    };
    if (detokTitle !== null) {
      updateRow.title = detokTitle;
    }

    const { error: updateErr } = await supabase.from("reports").update(updateRow).eq("id", id);
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
        "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id), report_templates(section_meta, school_id)"
      )
      .eq("id", id)
      .maybeSingle();
    if (freshErr || !fresh) {
      return NextResponse.json(
        { error: "Drafted but failed to re-read row", details: freshErr?.message },
        { status: 500 }
      );
    }
    const templateLogoUrl = await fetchTemplateLogoUrl(
      supabase,
      fresh.template_id as string | null,
      auth.user.schoolId
    );
    const freshTpl = (
      fresh as unknown as {
        report_templates: { section_meta: unknown; school_id: string } | null;
      }
    ).report_templates;
    const responseTemplateMeta: SectionMeta =
      freshTpl && freshTpl.school_id === auth.user.schoolId
        ? ((freshTpl.section_meta as SectionMeta | null) ?? {})
        : templateSectionMeta;
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
      templateSectionMeta: responseTemplateMeta,
      templateLogoUrl,
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
        turns: agentResult?.turns ?? 0,
        regenerations: agentResult?.regenerations ?? 0,
        capture_transcripts: input.transcripts.length,
        capture_notes: input.notes.length,
        capture_tokens: input.tokenMap.length,
        section_count: editorSections.length,
      },
    });

    return NextResponse.json({
      reportId: id,
      report: reportPayload,
      ...(agentResult
        ? {
            draft: agentResult.draft,
            references: agentResult.references,
            meta: { turns: agentResult.turns, regenerations: agentResult.regenerations },
          }
        : { meta: { turns: 0, regenerations: 0 } }),
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
