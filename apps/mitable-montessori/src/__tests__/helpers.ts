import { reportMemoryDb } from "./helpers/report-memory-db";
import { drainOnce } from "@/lib/sync/worker";

/** Test-only re-export so the e2e test can drive the sync drain deterministically
 *  without going through the kicked/backoff state machine in `runDrainLoop`. */
export const drainOnceForTest = drainOnce;

/**
 * Tiny in-memory Supabase shim that implements just enough of the surface
 * `lib/reports/workflow.ts` calls to verify the state machine. Not a general
 * mock — only the chained methods used in workflow.ts are honored.
 */
function buildFakeSupabase(initialReport: { id: string; status: string }) {
  const memory = reportMemoryDb({
    reports: [{ ...initialReport }],
    report_review_actions: [],
    report_recipients: [],
    classrooms: [],
    schools: [],
    students: [],
  });
  const report = memory.tables.reports[0];
  const reports = new Map([[initialReport.id, report]]);
  return {
    fake: memory.db,
    reports,
    reviewActions: memory.tables.report_review_actions,
    recipients: memory.tables.report_recipients,
  };
}

const REPORT_ID = "99999999-9999-9999-9999-999999999999";
const ACTOR = "33333333-3333-3333-3333-333333333333";

export async function runWorkflowFixture(): Promise<string[]> {
  const { approveReport, sendReport, submitReportForReview } =
    await import("@/lib/reports/workflow");
  const trace: string[] = [];
  const { fake, reports } = buildFakeSupabase({ id: REPORT_ID, status: "draft" });
  const ctx = { supabase: fake, reportId: REPORT_ID, actorUserId: ACTOR };

  await submitReportForReview(ctx);
  trace.push(`submit:draft→${reports.get(REPORT_ID)!.status}`);

  await approveReport(ctx);
  trace.push(`approve:submitted_for_review→${reports.get(REPORT_ID)!.status}`);

  await sendReport(ctx, ["g-1"], { "g-1": "g@example.com" });
  trace.push(`send:approved→${reports.get(REPORT_ID)!.status}`);

  return trace;
}

export async function sendDraftDirectly() {
  const { sendReport } = await import("@/lib/reports/workflow");
  const { fake } = buildFakeSupabase({ id: REPORT_ID, status: "draft" });
  await sendReport({ supabase: fake, reportId: REPORT_ID, actorUserId: ACTOR }, ["g-1"], {
    "g-1": "g@example.com",
  });
}
