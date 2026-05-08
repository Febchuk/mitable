import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { SendReportSchema } from "@/lib/schemas/report";
import { sendReport, WorkflowError } from "@/lib/reports/workflow";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = SendReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const supabase = createAdminClient();

  // Lookup guardian emails. Honors `student_guardians.receives_reports = true`.
  const { data: report } = await supabase
    .from("reports")
    .select("id, student_id")
    .eq("id", parsed.data.reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { data: links } = await supabase
    .from("student_guardians")
    .select("guardian_id, receives_reports, guardians(id, email)")
    .eq("student_id", report.student_id)
    .in("guardian_id", parsed.data.guardianRefs)
    .eq("receives_reports", true);
  if (!links || links.length === 0) {
    return NextResponse.json(
      { error: "No eligible guardians (receives_reports=true) for that selection" },
      { status: 400 }
    );
  }

  const emailMap: Record<string, string> = {};
  for (const link of links) {
    const guardians = (
      link as {
        guardians:
          | { id: string; email: string | null }
          | { id: string; email: string | null }[]
          | null;
      }
    ).guardians;
    const g = Array.isArray(guardians) ? guardians[0] : guardians;
    if (g?.email) emailMap[g.id] = g.email;
  }

  try {
    await sendReport(
      {
        supabase,
        reportId: parsed.data.reportId,
        actorUserId: auth.user.userId,
      },
      links.map((l) => (l as { guardian_id: string }).guardian_id),
      emailMap,
      parsed.data.messageBody
    );
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "send_report",
      target_table: "reports",
      target_id: parsed.data.reportId,
      metadata: { recipient_count: links.length },
    });
    return NextResponse.json({ ok: true, recipientCount: links.length });
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
