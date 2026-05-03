import type { NameRef } from "@/lib/reports/token-preservation";

/**
 * Tokenized records the agent loop reads from. The adapter pulls real data
 * from Supabase (production) or a fixture (test) and hands back a tokenized
 * view: every name has been replaced with a [STUDENT_n] / [SUBTOPIC_n] /
 * [CLASSROOM_n] token. The adapter also returns the parallel reference set
 * the client uses to de-tokenize the final draft.
 */

export interface TokenizedCommandRecord {
  student_token: string;
  classroom_token: string;
  subtopic_token: string | null;
  command_type: "attendance" | "progress" | "note";
  status: string | null;
  date: string;
  comment: string | null;
}

export interface TokenizedProgressRow {
  subtopic_token: string;
  status: "introduced" | "practicing" | "mastered" | "na";
  comment: string | null;
  updated_at: string;
}

export interface ReportReferenceSet {
  /** Tokens → display + UUID. */
  refs: Array<NameRef & { token: string; kind: "student" | "subtopic" | "classroom" }>;
}

export interface ReportDataAdapter {
  /** Returns the student's commands + the references to render their tokens. */
  getStudentCommands(args: {
    studentRef: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<{ commands: TokenizedCommandRecord[]; references: ReportReferenceSet }>;

  /** Returns the current progress projection, scoped to a student. */
  getStudentProgressSummary(args: {
    studentRef: string;
  }): Promise<{ rows: TokenizedProgressRow[]; references: ReportReferenceSet }>;
}

export function mergeReferenceSets(...sets: ReportReferenceSet[]): ReportReferenceSet {
  const seen = new Map<string, ReportReferenceSet["refs"][number]>();
  for (const s of sets) {
    for (const r of s.refs) {
      if (!seen.has(r.token)) seen.set(r.token, r);
    }
  }
  return { refs: Array.from(seen.values()) };
}
