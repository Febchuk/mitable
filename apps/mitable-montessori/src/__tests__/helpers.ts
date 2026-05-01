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
  const reports = new Map([[initialReport.id, { ...initialReport }]]);
  const reviewActions: Array<{ report_id: string; action_type: string }> = [];
  const recipients: Array<{ report_id: string; guardian_id: string }> = [];

  const fake = {
    from(table: string) {
      if (table === "reports") {
        return {
          select() {
            return {
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => {
                  const r = reports.get(val);
                  if (!r) return { data: null, error: null };
                  return { data: r, error: null };
                },
              }),
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq: async (_col: string, val: string) => {
                const r = reports.get(val);
                if (!r) return { error: { message: "Report not found" } };
                Object.assign(r, patch);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "report_review_actions") {
        return {
          insert: async (row: { report_id: string; action_type: string }) => {
            reviewActions.push(row);
            return { error: null };
          },
        };
      }
      if (table === "report_recipients") {
        return {
          insert: async (rows: Array<{ report_id: string; guardian_id: string }>) => {
            recipients.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { fake, reports, reviewActions, recipients };
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

export async function attemptInvalidSend() {
  const { sendReport } = await import("@/lib/reports/workflow");
  const { fake } = buildFakeSupabase({ id: REPORT_ID, status: "draft" });
  await sendReport({ supabase: fake, reportId: REPORT_ID, actorUserId: ACTOR }, ["g-1"], {
    "g-1": "g@example.com",
  });
}
