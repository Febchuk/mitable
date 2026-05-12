import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { approveReport, WorkflowError } from "@/lib/reports/workflow";
import { auditLog } from "@/lib/audit/log";

/**
 * Admin bulk approve. Used by the "Approve all green" action — the admin
 * has reviewed the AI scores and trusts the green-tier (≥85) rows enough
 * to sign off without opening each one. Runs serially through the
 * workflow so each row gets the same logging/RLS treatment a single
 * /approve does.
 *
 * Partial success is reported per-id. The caller (UI) shows a toast
 * summarizing successes + lists failed ids for review.
 */
const BulkApproveSchema = z.object({
  reportIds: z.array(z.string().uuid()).min(1).max(100),
});

type Outcome = {
  reportId: string;
  ok: boolean;
  error?: string;
};

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BulkApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Confirm every report is in this admin's school before we touch any of
  // them. Saves us from approving 47 reports + erroring on the 48th
  // (which is a worse end state than refusing the whole batch).
  const { data: rows } = await supabase
    .from("reports")
    .select("id, ai_score, status, students!inner(school_id)")
    .in("id", parsed.data.reportIds);
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No matching reports" }, { status: 404 });
  }
  const typed = rows as unknown as Array<{
    id: string;
    ai_score: number | null;
    status: string;
    students: { school_id: string } | null;
  }>;
  for (const r of typed) {
    if (r.students?.school_id !== auth.user.schoolId) {
      return NextResponse.json({ error: `Report ${r.id} is not in your school` }, { status: 403 });
    }
  }

  // Approve each one through the workflow so logging + audit are consistent
  // with single-report approvals. Errors per-row are captured, not thrown.
  const outcomes: Outcome[] = [];
  for (const r of typed) {
    try {
      await approveReport({
        supabase,
        reportId: r.id,
        actorUserId: auth.user.userId,
      });
      outcomes.push({ reportId: r.id, ok: true });
    } catch (err) {
      const message =
        err instanceof WorkflowError ? err.message : (err as Error).message || "Approve failed";
      outcomes.push({ reportId: r.id, ok: false, error: message });
    }
  }

  const successCount = outcomes.filter((o) => o.ok).length;

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report_bulk_approve",
    target_table: "reports",
    metadata: {
      requested: parsed.data.reportIds.length,
      approved: successCount,
      failed: outcomes.length - successCount,
    },
  });

  revalidatePath("/app/reports");
  revalidatePath("/admin/reports");
  revalidatePath("/app/reports-v2");
  revalidatePath("/admin/reports-v2");

  return NextResponse.json({
    ok: true,
    approved: successCount,
    failed: outcomes.length - successCount,
    outcomes,
  });
}
