import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import { RequestReportChangesSchema } from "@/lib/schemas/report";
import { requestReportChanges, WorkflowError } from "@/lib/reports/workflow";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = RequestReportChangesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  try {
    await requestReportChanges(
      {
        supabase,
        reportId: parsed.data.reportId,
        actorUserId: auth.user.userId,
      },
      parsed.data.notes
    );
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "request_report_changes",
      target_table: "reports",
      target_id: parsed.data.reportId,
    });
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
