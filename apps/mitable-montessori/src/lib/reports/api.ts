/**
 * Typed client for report-related endpoints used by the production reports
 * route and the floating ChatDock. Wraps `/api/v1/reports/*`. All functions
 * throw `ReportsApiError` on failure with a parsed `{ error }` message when
 * the server returned one, so call sites can use try/catch + a toast.
 */

import type { ChatTurnMessage } from "@/lib/schemas/report-chat";
export type { ChatTurnMessage };

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

// ============================================================================
// Reviewers
// ============================================================================

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

// ============================================================================
// Report chat
// ============================================================================

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

/** Send a chat turn. The server runs the tool-calling agent and returns the
 *  user message + every assistant message produced in the turn (1-N
 *  depending on whether the agent ended with a clarify, a proposal, etc). */
export async function postReportChatTurn(args: {
  reportId: string;
  userMessage: string;
}): Promise<ChatTurnMessage[]> {
  const data = (await postJson(`/api/v1/reports/${args.reportId}/chat/turn`, {
    userMessage: args.userMessage,
  })) as { messages?: ChatTurnMessage[] };
  return data.messages ?? [];
}
