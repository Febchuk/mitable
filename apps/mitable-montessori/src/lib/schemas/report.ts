import { z } from "zod";

/**
 * Phase 3 report schemas. Tokens flow through agent context exactly like Phase
 * 1: read tools return tokenized payloads, the draft tool's body must contain
 * tokens (or no PII at all), the client de-tokenizes for display.
 */

export const ReportType = z.enum(["daily", "major", "incident"]);
export type ReportType = z.infer<typeof ReportType>;

export const ReportKind = z.enum(["Daily", "Major", "Incident"]);
export type ReportKind = z.infer<typeof ReportKind>;

export const TokenMapEntrySchema = z.object({
  token: z.string().regex(/^\[STUDENT_\d+\]$/),
  studentId: z.string().uuid(),
  matchedText: z.string(),
});
export type TokenMapEntry = z.infer<typeof TokenMapEntrySchema>;

export const CreateReportRequestSchema = z.object({
  childId: z.string().uuid(),
  kind: ReportKind,
  templateId: z.string().uuid().nullable().optional(),
  /** Client-derived transcripts — never persisted as binary. */
  transcripts: z.array(z.string().min(1)).max(8).optional().default([]),
  /** Client-derived OCR text from handwritten notes. */
  notes: z.array(z.string().min(1)).max(20).optional().default([]),
  /** Fuzzy-matched tokens. */
  tokenMap: z.array(TokenMapEntrySchema).max(50).optional().default([]),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const UpdateReportRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(8000).optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        heading: z.string(),
        paragraphs: z.array(z.object({ id: z.string(), html: z.string() })),
      })
    )
    .max(20)
    .optional(),
});
export type UpdateReportRequest = z.infer<typeof UpdateReportRequestSchema>;

export const DraftFromCaptureRequestSchema = z.object({
  transcripts: z.array(z.string().min(1)).max(8).optional().default([]),
  notes: z.array(z.string().min(1)).max(20).optional().default([]),
  tokenMap: z.array(TokenMapEntrySchema).max(50).optional().default([]),
  /**
   * When true, the drafting agent must not read stored commands / progress
   * history — only the supplied transcripts, notes, and template guidance.
   */
  captureOnly: z.boolean().optional().default(false),
});
export type DraftFromCaptureRequest = z.infer<typeof DraftFromCaptureRequestSchema>;

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
 * The draft tool the agent must call to finalize a report. Each section's
 * `content` must contain only tokens for student / subtopic / classroom —
 * never raw names. The validator in `lib/reports/token-preservation.ts`
 * enforces this against the concatenation of all section contents.
 */
export const DraftReportToolCall = z.object({
  tool: z.literal("draft_report"),
  args: z.object({
    student_token: z.string().regex(/^\[STUDENT_\d+\]$/),
    report_type: ReportType,
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().min(1).max(200),
    sections: z
      .array(
        z.object({
          heading: z.string().min(1).max(200),
          content: z.string().min(1).max(4000),
        })
      )
      .min(1)
      .max(20),
  }),
});
export type DraftReportToolCallT = z.infer<typeof DraftReportToolCall>;

export const SubmitReportSchema = z.object({
  reportId: z.string().uuid(),
  /** Optional list of user ids assigned as reviewers. Persisted to
   *  report_reviewers. When omitted, the report is submitted with no
   *  assignees — anyone with access can still approve. */
  reviewerIds: z.array(z.string().uuid()).max(10).optional(),
  /** Optional note from the author to the reviewers — stored alongside
   *  the reviewer assignment for now (Phase 3.5 surfaces it in the UI). */
  note: z.string().max(2000).optional(),
});

/** Body for POST /api/v1/reports/[id]/reviewers — replaces the full
 *  reviewer set for a report. Omitted/empty list clears all assignments. */
export const AssignReviewersSchema = z.object({
  reviewerIds: z.array(z.string().uuid()).max(10),
});

/** Body for POST /api/v1/reports/[id]/reviewers/tick — current user marks
 *  themselves as having approved (or requested changes). */
export const TickReviewerSchema = z.object({
  status: z.enum(["approved", "changes_requested"]),
  note: z.string().max(2000).optional(),
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
  messageBody: z.string().max(2000).optional(),
});
