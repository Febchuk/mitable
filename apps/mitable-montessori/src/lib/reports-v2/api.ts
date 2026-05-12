/**
 * Typed client for the reports-v2 UI. Wraps the existing /api/v1/reports/*
 * endpoints. No new endpoints introduced here — Phase 3 only wires the UI.
 *
 * All functions throw on failure (with a parsed { error } message if the
 * server returned one) so call sites can use try/catch + a toast.
 */

export class ReportsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    [k: string]: unknown;
  };
  if (!res.ok) {
    throw new ReportsApiError(
      data.error ?? `Request failed (${res.status})`,
      res.status,
      data.code
    );
  }
  return data;
}

/** Transition: draft → submitted_for_review. Optionally seeds
 *  report_reviewers with the author's reviewer picks. */
export async function submitReport(args: {
  reportId: string;
  reviewerIds?: string[];
  note?: string;
}): Promise<void> {
  await postJson("/api/v1/reports/submit", args);
}

/** Replace the reviewer assignment list for a report. Used by admin
 *  reassign UI. Server-side wipes existing assignments before insert. */
export async function assignReviewers(reportId: string, reviewerIds: string[]): Promise<void> {
  await postJson(`/api/v1/reports/${reportId}/reviewers`, { reviewerIds });
}

/** Current user marks themselves as approved or changes-requested on the
 *  report. 403s if they're not in report_reviewers for this report. */
export async function tickReviewer(args: {
  reportId: string;
  status: "approved" | "changes_requested";
  note?: string;
}): Promise<void> {
  const { reportId, ...body } = args;
  await postJson(`/api/v1/reports/${reportId}/reviewers/tick`, body);
}

export type ReviewerCandidate = {
  userId: string;
  name: string;
  email: string | null;
  role: "teacher" | "admin";
};

/** Eligible reviewer pool — all teachers + admins in the school except me. */
export async function fetchReviewerCandidates(): Promise<ReviewerCandidate[]> {
  const res = await fetch("/api/v1/reports/reviewer-candidates", { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ReportsApiError(data.error ?? `Could not load reviewers (${res.status})`, res.status);
  }
  const data = (await res.json()) as { candidates?: ReviewerCandidate[] };
  return data.candidates ?? [];
}

/** Transition: draft|submitted_for_review|in_review → approved. */
export async function approveReport(reportId: string): Promise<void> {
  await postJson("/api/v1/reports/approve", { reportId });
}

/** Transition: submitted_for_review|in_review → changes_requested. */
export async function requestChanges(reportId: string, notes: string): Promise<void> {
  await postJson("/api/v1/reports/changes", { reportId, notes });
}

/** Transition: approved → sent. Returns the # of guardians the email
 *  pipeline queued. */
export async function sendReport(args: {
  reportId: string;
  guardianRefs: string[];
  messageBody?: string;
}): Promise<{ recipientCount: number }> {
  const data = (await postJson("/api/v1/reports/send", args)) as {
    recipientCount?: number;
  };
  return { recipientCount: data.recipientCount ?? 0 };
}

/** Admin-only: revert a report (in any non-draft state) back to draft. Wipes
 *  reviewer assignments + clears approval metadata. Optional note is logged
 *  in the action history. */
export async function sendBackToDraft(reportId: string, note?: string): Promise<void> {
  await postJson(`/api/v1/reports/${reportId}/send-back-to-draft`, { note });
}

export type BulkApproveOutcome = {
  reportId: string;
  ok: boolean;
  error?: string;
};

/** Admin-only: approve a batch of reports (the "Approve all green" affordance).
 *  Returns per-id outcomes so the UI can show which ones failed. */
export async function bulkApprove(reportIds: string[]): Promise<{
  approved: number;
  failed: number;
  outcomes: BulkApproveOutcome[];
}> {
  const data = (await postJson("/api/v1/reports/bulk-approve", { reportIds })) as {
    approved?: number;
    failed?: number;
    outcomes?: BulkApproveOutcome[];
  };
  return {
    approved: data.approved ?? 0,
    failed: data.failed ?? 0,
    outcomes: data.outcomes ?? [],
  };
}

/** Re-run the AI scorer on a report. Used by the "↻ Re-score now" button
 *  in the AI callout reasoning panel. Returns the fresh score so the caller
 *  can update the UI without a router refresh. */
export async function rescoreReport(reportId: string): Promise<{
  score: number;
  flags: {
    kind: "tone" | "evidence" | "pii" | "template";
    status: "ok" | "warn" | "fail";
    note: string;
  }[];
  reasoning: string[];
}> {
  const data = (await postJson(`/api/v1/reports/${reportId}/score`, {})) as {
    score?: number;
    flags?: unknown;
    reasoning?: unknown;
  };
  return {
    score: typeof data.score === "number" ? data.score : 0,
    flags: Array.isArray(data.flags) ? (data.flags as never) : [],
    reasoning: Array.isArray(data.reasoning) ? (data.reasoning as string[]) : [],
  };
}

export type Guardian = {
  guardianId: string;
  name: string;
  email: string | null;
  relationship: string | null;
};

// ============================================================================
// Report chat
// ============================================================================

/** A chat message as the rail renders it. Re-uses the canonical
 *  `ChatTurnMessage` discriminated union from the schemas package. */
import type { ChatTurnMessage } from "@/lib/schemas/report-chat";
export type { ChatTurnMessage };

/** Load the full chat history for a report (oldest first). The endpoint
 *  applies no caps — callers can rely on having every persisted message. */
export async function fetchReportChat(reportId: string): Promise<ChatTurnMessage[]> {
  const res = await fetch(`/api/v1/reports/${reportId}/chat`, { cache: "no-store" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ReportsApiError(data.error ?? `Could not load chat (${res.status})`, res.status);
  }
  const data = (await res.json()) as { messages?: ChatTurnMessage[] };
  return data.messages ?? [];
}

/** Send a chat turn. The server runs the tool-calling agent and returns
 *  the user message + every assistant message produced in the turn (1-N
 *  depending on whether the agent ended with a clarify, a proposal, etc).
 *
 *  Phase 6 only sends free-text messages — no targetRef, no attachments.
 *  Both fields are supported by the endpoint and can land later when the
 *  v2 reading-pane gains inline section selection + photo capture. */
export async function postReportChatTurn(args: {
  reportId: string;
  userMessage: string;
}): Promise<ChatTurnMessage[]> {
  const data = (await postJson(`/api/v1/reports/${args.reportId}/chat/turn`, {
    userMessage: args.userMessage,
  })) as { messages?: ChatTurnMessage[] };
  return data.messages ?? [];
}

/** Lookup eligible guardians for the send-to-parents flow. */
export async function fetchEligibleGuardians(studentId: string): Promise<Guardian[]> {
  const res = await fetch(`/api/v1/students/${studentId}/guardians?receivesReports=true`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ReportsApiError(data.error ?? `Could not load guardians (${res.status})`, res.status);
  }
  const data = (await res.json()) as { guardians?: Guardian[] };
  return data.guardians ?? [];
}
