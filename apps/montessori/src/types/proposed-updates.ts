/**
 * ProposedUpdates — frontend mirror.
 *
 * The contract between `POST /api/montessori/agent/interpret` and the
 * review-and-confirm UI. The backend Zod schema at
 * apps/backend/src/domains/montessori/types/proposed-updates.ts is
 * the source of truth; the types here are kept in lockstep by hand.
 *
 * (We intentionally don't share a package — Montessori types stay
 * inside the Montessori app per the project rules.)
 */

export type MasteryLevel = "introduced" | "practising" | "mastered";

interface BaseProposal {
    /** Stable id within a single interpretation. */
    proposalId: string;
    summary: string;
    /** Verbatim slice of the input the agent attributes the proposal
     *  to (a sentence from the transcript, OCR'd note phrase, etc.). */
    sourceQuote?: string | null;
}

export interface ObservationProposal extends BaseProposal {
    kind: "observation";
    studentId: string;
    studentName: string;
    topicId: string;
    topicName: string;
    domainName: string;
    level: MasteryLevel;
    note: string | null;
}

export interface AttendanceProposal extends BaseProposal {
    kind: "attendance";
    studentId: string;
    studentName: string;
    date: string; // YYYY-MM-DD
    status: "present" | "absent";
    note: string | null;
}

export interface ReportDraftSection {
    domainId: string;
    domainName: string;
    narrative: string;
}

export interface ReportDraftProposal extends BaseProposal {
    kind: "report-draft";
    studentId: string;
    studentName: string;
    classroomId: string;
    type: "end-of-term" | "activity-update";
    reportSummary: string | null;
    sections: ReportDraftSection[];
}

export type ProposedUpdate =
    | ObservationProposal
    | AttendanceProposal
    | ReportDraftProposal;

export interface ProposedUpdatesEnvelope {
    summary: string;
    proposals: ProposedUpdate[];
    /** Set when the agent couldn't fully resolve the input — surfaced
     *  as a chat reply, never as an actionable card. */
    clarifyingQuestion?: string | null;
}
