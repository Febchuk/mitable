import { elementaryGradeSnapshot } from "./elementary-grade-snapshot";
import { termProgressSnapshot } from "./term-progress-snapshot";
import { refreshBundledSenSections } from "./sen-bundle";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportReviewActionType, ReportStatus } from "@/lib/schemas/report";
import { toddlerSendSnapshot, type DailyReportSnapshotSource } from "./toddler-send-snapshot";

/**
 * Report workflow transitions. Each call must:
 *   - validate the source status against the action
 *   - update the status atomically
 *   - write a `report_review_actions` row with the actor and notes
 *
 * Daily reports owned by the teacher may short-circuit `draft → approved` —
 * checked by the route handler before calling `approveReport`. All other
 * transitions enforce the standard pipeline.
 */

interface TransitionContext {
  supabase: SupabaseClient;
  reportId: string;
  actorUserId: string;
}

const ALLOWED_FROM: Record<ReportReviewActionType, ReportStatus[]> = {
  submitted: ["draft", "changes_requested"],
  commented: ["submitted_for_review", "in_review", "changes_requested"],
  edited: ["draft", "changes_requested"],
  approved: ["draft", "submitted_for_review", "in_review"],
  requested_changes: ["submitted_for_review", "in_review"],
  sent: ["draft", "changes_requested", "approved"],
};

const NEW_STATUS: Record<ReportReviewActionType, ReportStatus | null> = {
  submitted: "submitted_for_review",
  commented: null, // status unchanged
  edited: null,
  approved: "approved",
  requested_changes: "changes_requested",
  sent: "sent",
};

export class WorkflowError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid_transition" | "db_error"
  ) {
    super(message);
  }
}

async function applyTransition(
  ctx: TransitionContext,
  action: ReportReviewActionType,
  notes: string | null,
  extras?: Record<string, unknown>
) {
  const { data: report, error: readErr } = await ctx.supabase
    .from("reports")
    .select(
      "id, updated_at, template_id, title, body, status, report_type, student_id, classroom_id, report_date, period_start, period_end, sections, section_meta, section_guidance, sen_daily_report_id, term_id"
    )
    .eq("id", ctx.reportId)
    .maybeSingle();
  if (readErr || !report) {
    throw new WorkflowError(`Report ${ctx.reportId} not found`, "not_found");
  }
  const currentStatus = report.status as ReportStatus;
  if (!ALLOWED_FROM[action].includes(currentStatus)) {
    const verbs: Record<ReportReviewActionType, string> = {
      submitted: "submit",
      commented: "comment on",
      edited: "edit",
      approved: "approve",
      requested_changes: "request changes on",
      sent: "send",
    };
    throw new WorkflowError(
      `Cannot ${verbs[action]} a report in status '${currentStatus}'`,
      "invalid_transition"
    );
  }

  const next = NEW_STATUS[action];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (next) update.status = next;
  if (next === "approved") {
    update.approved_by_user_id = ctx.actorUserId;
    update.approved_at = new Date().toISOString();
  }
  if (next === "sent") {
    update.sent_at = new Date().toISOString();
  }
  if (extras) Object.assign(update, extras);
  if (action === "sent" && report.report_type === "daily") {
    const snapshot = await toddlerSendSnapshot(ctx.supabase, report as DailyReportSnapshotSource);
    if (snapshot) Object.assign(update, snapshot);
    const bundled = await refreshBundledSenSections(ctx.supabase, {
      ...report,
      sections: snapshot?.sections ?? report.sections,
    });
    if (bundled) update.sections = bundled;
  }

  if (action === "sent") {
    const progress = await termProgressSnapshot(ctx.supabase, report);
    if (progress) Object.assign(update, progress);
    const grades = await elementaryGradeSnapshot(ctx.supabase, {
      ...report,
      sections: progress?.sections ?? report.sections,
      section_meta: progress?.section_meta ?? report.section_meta,
    });
    if (grades) Object.assign(update, grades);
  }

  const { error: updateErr } = await ctx.supabase
    .from("reports")
    .update(update)
    .eq("id", ctx.reportId);
  if (updateErr) throw new WorkflowError(updateErr.message, "db_error");

  const { error: actionErr } = await ctx.supabase.from("report_review_actions").insert({
    report_id: ctx.reportId,
    action_by_user_id: ctx.actorUserId,
    action_type: action,
    notes,
  });
  if (actionErr) throw new WorkflowError(actionErr.message, "db_error");
}

export async function submitReportForReview(ctx: TransitionContext) {
  await applyTransition(ctx, "submitted", null);
}

export async function requestReportChanges(ctx: TransitionContext, notes: string) {
  await applyTransition(ctx, "requested_changes", notes);
}

export async function approveReport(ctx: TransitionContext) {
  await applyTransition(ctx, "approved", null);
}

export async function sendReport(
  ctx: TransitionContext,
  guardianRefs: string[],
  _guardianEmailMap: Record<string, string>,
  messageBody?: string
) {
  const { data: source, error: readError } = await ctx.supabase
    .from("reports")
    .select("*")
    .eq("id", ctx.reportId)
    .maybeSingle();
  if (readError || !source) throw new WorkflowError("Report not found", "not_found");
  let snapshot = { ...source };
  let alreadyPublished = false;
  if (source.status === "sent") {
    const { data: publication, error } = await ctx.supabase
      .from("report_publications")
      .select("snapshot")
      .eq("report_id", source.id)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new WorkflowError("Could not load the shared version. Please retry.", "db_error");
    if (publication?.snapshot) {
      snapshot = { ...source, ...publication.snapshot };
      alreadyPublished = true;
    }
  }
  // Retrying a shared report must not silently refresh it from newer classroom data.
  if (source.status !== "sent" && source.report_type === "daily") {
    const daily = await toddlerSendSnapshot(ctx.supabase, source as DailyReportSnapshotSource);
    if (daily) snapshot = { ...snapshot, ...daily };
    const bundled = await refreshBundledSenSections(ctx.supabase, snapshot);
    if (bundled) snapshot.sections = bundled;
  }
  const progress =
    source.status === "sent" ? null : await termProgressSnapshot(ctx.supabase, snapshot);
  if (progress) snapshot = { ...snapshot, ...progress };
  const grades =
    source.status === "sent" ? null : await elementaryGradeSnapshot(ctx.supabase, snapshot);
  if (grades) snapshot = { ...snapshot, ...grades };
  if (!alreadyPublished) {
    const { data: room } = await ctx.supabase
      .from("classrooms")
      .select("school_id")
      .eq("id", source.classroom_id)
      .maybeSingle();
    const { data: school } = room?.school_id
      ? await ctx.supabase.from("schools").select("name").eq("id", room.school_id).maybeSingle()
      : { data: null };
    snapshot.school_name = school?.name ?? null;
    const { data: student } = await ctx.supabase
      .from("students")
      .select("first_name, last_name, preferred_name")
      .eq("id", source.student_id)
      .maybeSingle();
    snapshot.student_name = student
      ? `${student.preferred_name || student.first_name} ${student.last_name || ""}`.trim()
      : null;
    const { data: template } = source.template_id
      ? await ctx.supabase
          .from("report_templates")
          .select("logo_url")
          .eq("id", source.template_id)
          .eq("school_id", room?.school_id)
          .maybeSingle()
      : { data: null };
    snapshot.template_logo_url = template?.logo_url ?? null;
  }
  const { data, error } = await ctx.supabase.rpc("publish_report", {
    p_report_id: ctx.reportId,
    p_actor_id: ctx.actorUserId,
    p_expected_updated_at: source.updated_at ?? null,
    p_snapshot: Object.fromEntries(
      Object.entries(snapshot).filter(([key]) =>
        [
          "id",
          "student_id",
          "classroom_id",
          "report_type",
          "report_date",
          "period_start",
          "period_end",
          "term_id",
          "toddler_daily_log_id",
          "title",
          "body",
          "sections",
          "section_meta",
          "template_id",
          "template_logo_url",
          "school_name",
          "student_name",
        ].includes(key)
      )
    ),
    p_guardian_ids: [...new Set(guardianRefs)],
    p_message_body: messageBody ?? null,
  });
  if (error) throw new WorkflowError(error.message, "db_error");
  return data as {
    reportId: string;
    publicationId: string;
    queued: number;
    alreadySent: number;
    unchanged: boolean;
  };
}

export async function editDraftBody(ctx: TransitionContext, body: string, title?: string) {
  const update: Record<string, unknown> = { body, updated_at: new Date().toISOString() };
  if (title) update.title = title;
  const { error } = await ctx.supabase.from("reports").update(update).eq("id", ctx.reportId);
  if (error) throw new WorkflowError(error.message, "db_error");
  await ctx.supabase.from("report_review_actions").insert({
    report_id: ctx.reportId,
    action_by_user_id: ctx.actorUserId,
    action_type: "edited",
    notes: null,
  });
}
