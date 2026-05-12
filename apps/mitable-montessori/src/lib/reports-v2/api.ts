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

/** Transition: draft → submitted_for_review. */
export async function submitReport(reportId: string): Promise<void> {
  await postJson("/api/v1/reports/submit", { reportId });
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

// NOTE: "Send back to draft" needs a dedicated endpoint (the existing PATCH
// route only auto-reverts from `submitted_for_review` and requires non-empty
// body). Not wired here — surfaces as a disabled UI affordance until the
// endpoint lands.

export type Guardian = {
  guardianId: string;
  name: string;
  email: string | null;
  relationship: string | null;
};

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
