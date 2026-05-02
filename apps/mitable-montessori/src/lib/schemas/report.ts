import { z } from "zod";

/**
 * Phase 3 report schemas. Tokens flow through agent context exactly like Phase
 * 1: read tools return tokenized payloads, the draft tool's body must contain
 * tokens (or no PII at all), the client de-tokenizes for display.
 */

export const ReportType = z.enum(["daily", "major"]);
export type ReportType = z.infer<typeof ReportType>;

export const ReportStatus = z.enum([
  "draft",
  "submitted_for_review",
  "in_review",
  "changes_requested",
  "approved",
  "sent",
]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const ReportReviewActionType = z.enum([
  "submitted",
  "commented",
  "edited",
  "approved",
  "requested_changes",
  "sent",
]);
export type ReportReviewActionType = z.infer<typeof ReportReviewActionType>;

export const DraftReportRequestSchema = z.object({
  studentToken: z.string().regex(/^\[STUDENT_\d+\]$/),
  studentRef: z.string().uuid(),
  classroomId: z.string().uuid(),
  reportType: ReportType,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DraftReportRequest = z.infer<typeof DraftReportRequestSchema>;

/**
 * The draft tool the agent must call to finalize a report. The `body` field
 * must contain only tokens for student / subtopic / classroom — never raw
 * names. The validator in `lib/reports/token-preservation.ts` enforces this.
 */
export const DraftReportToolCall = z.object({
  tool: z.literal("draft_report"),
  args: z.object({
    student_token: z.string().regex(/^\[STUDENT_\d+\]$/),
    report_type: ReportType,
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().min(1).max(200),
    draft_text: z.string().min(1).max(8000),
  }),
});
export type DraftReportToolCallT = z.infer<typeof DraftReportToolCall>;

export const SubmitReportSchema = z.object({
  reportId: z.string().uuid(),
});

export const RequestReportChangesSchema = z.object({
  reportId: z.string().uuid(),
  notes: z.string().min(1).max(2000),
});

export const ApproveReportSchema = z.object({
  reportId: z.string().uuid(),
});

export const SendReportSchema = z.object({
  reportId: z.string().uuid(),
  guardianRefs: z.array(z.string().uuid()).min(1).max(10),
});
