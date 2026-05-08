import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { ApproveReportSchema } from "@/lib/schemas/report";
import { approveReport, WorkflowError } from "@/lib/reports/workflow";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = ApproveReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Daily reports owned by the teacher may short-circuit draft → approved.
  // Major reports require admin role (RLS ultimately enforces this).
  const { data: report } = await supabase
    .from("reports")
    .select("id, report_type, status, created_by_user_id")
    .eq("id", parsed.data.reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const isOwnDailyDraft =
    report.report_type === "daily" &&
    report.status === "draft" &&
    report.created_by_user_id === auth.user.userId;
  if (!isOwnDailyDraft && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can approve major or non-owned reports" },
      { status: 403 }
    );
  }

  try {
    await approveReport({
      supabase,
      reportId: parsed.data.reportId,
      actorUserId: auth.user.userId,
    });
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "approve_report",
      target_table: "reports",
      target_id: parsed.data.reportId,
      metadata: { short_circuit: isOwnDailyDraft },
    });
    revalidatePath(`/app/reports/${parsed.data.reportId}`);
    revalidatePath(`/admin/reports/${parsed.data.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/admin/reports");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkflowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "not_found" ? 404 : 409 }
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
