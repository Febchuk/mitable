import { z } from "zod";

/**
 * ProposedUpdates is the contract between the agent's interpretation
 * step and the review-and-confirm step. It describes the structured
 * changes the agent thinks the teacher meant — never anything the
 * agent saves on its own. The teacher always reviews, can edit any
 * field on the card, and explicitly approves before /agent/confirm
 * applies the proposals to the DB.
 *
 * The frontend has a parallel TS-only type at
 * apps/montessori/src/types/proposed-updates.ts. Keep the two in
 * lockstep — the backend Zod schema is the source of truth.
 */

// ─── Shared bits ─────────────────────────────────────────────────────

const isoDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const baseProposalShape = {
    /**
     * Stable id within a single interpretation. Lets the UI track
     * edits on a card and lets /agent/confirm correlate proposals
     * with the user's edits without relying on array index.
     */
    proposalId: z.string().min(1),
    /** One-liner shown in the review-card header. */
    summary: z.string().min(1).max(280),
    /**
     * Optional verbatim slice of the input the agent attributes the
     * proposal to (a sentence from the transcript, a phrase from the
     * OCR'd note, etc.). Drives the "show original" affordance and
     * helps teachers sanity-check the agent.
     */
    sourceQuote: z.string().max(2000).nullable().optional(),
};

// ─── Observation ─────────────────────────────────────────────────────

export const ObservationProposalSchema = z.object({
    ...baseProposalShape,
    kind: z.literal("observation"),
    studentId: z.string().uuid(),
    studentName: z.string().min(1),
    topicId: z.string().uuid(),
    topicName: z.string().min(1),
    domainName: z.string().min(1),
    level: z.enum(["introduced", "practising", "mastered"]),
    note: z.string().max(2000).nullable(),
});
export type ObservationProposal = z.infer<typeof ObservationProposalSchema>;

// ─── Attendance ──────────────────────────────────────────────────────

export const AttendanceProposalSchema = z.object({
    ...baseProposalShape,
    kind: z.literal("attendance"),
    studentId: z.string().uuid(),
    studentName: z.string().min(1),
    date: isoDateString,
    status: z.enum(["present", "absent"]),
    note: z.string().max(500).nullable(),
});
export type AttendanceProposal = z.infer<typeof AttendanceProposalSchema>;

// ─── Report draft ────────────────────────────────────────────────────

export const ReportDraftSectionSchema = z.object({
    domainId: z.string().uuid(),
    domainName: z.string().min(1),
    narrative: z.string().min(1).max(4000),
});
export type ReportDraftSection = z.infer<typeof ReportDraftSectionSchema>;

export const ReportDraftProposalSchema = z.object({
    ...baseProposalShape,
    kind: z.literal("report-draft"),
    studentId: z.string().uuid(),
    studentName: z.string().min(1),
    classroomId: z.string().uuid(),
    type: z.enum(["end-of-term", "activity-update"]),
    /** Top-of-report narrative; nullable so admins can review before
     *  the agent fills it in. */
    reportSummary: z.string().max(4000).nullable(),
    sections: z.array(ReportDraftSectionSchema),
});
export type ReportDraftProposal = z.infer<typeof ReportDraftProposalSchema>;

// ─── Discriminated union + envelope ─────────────────────────────────

export const ProposedUpdateSchema = z.discriminatedUnion("kind", [
    ObservationProposalSchema,
    AttendanceProposalSchema,
    ReportDraftProposalSchema,
]);
export type ProposedUpdate = z.infer<typeof ProposedUpdateSchema>;

/**
 * What /agent/interpret returns and what /agent/confirm consumes
 * (after the user's edits are merged in).
 */
export const ProposedUpdatesEnvelopeSchema = z.object({
    /**
     * Short prose summary the UI shows above the proposal cards.
     * Distinct from each card's `summary` field, which is per-proposal.
     */
    summary: z.string().min(1).max(1000),
    proposals: z.array(ProposedUpdateSchema),
    /**
     * If the agent couldn't fully resolve the input (e.g. ambiguous
     * student name), it asks one clarifying question instead of
     * hallucinating a guess. The UI surfaces this as a chat reply
     * rather than as an actionable card.
     */
    clarifyingQuestion: z.string().max(500).nullable().optional(),
});
export type ProposedUpdatesEnvelope = z.infer<typeof ProposedUpdatesEnvelopeSchema>;
