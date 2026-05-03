import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportReviewActionType, ReportStatus } from "@/lib/schemas/report";

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
  submitted: ["draft"],
  commented: ["submitted_for_review", "in_review", "changes_requested"],
  edited: ["draft", "changes_requested"],
  approved: ["draft", "submitted_for_review", "in_review"],
  requested_changes: ["submitted_for_review", "in_review"],
  sent: ["approved"],
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
    .select("id, status")
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
  guardianEmailMap: Record<string, string>
) {
  await applyTransition(ctx, "sent", null);
  // Insert recipient rows in 'pending' — the email worker (Phase 4 Week 12)
  // flips them to sent / failed.
  const rows = guardianRefs.map((gid) => ({
    report_id: ctx.reportId,
    guardian_id: gid,
    email_snapshot: guardianEmailMap[gid] ?? null,
    delivery_status: "pending" as const,
  }));
  const { error } = await ctx.supabase.from("report_recipients").insert(rows);
  if (error) throw new WorkflowError(error.message, "db_error");
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
