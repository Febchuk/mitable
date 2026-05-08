import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { drainPendingReports, StubEmailSender } from "@/lib/admin/email-worker";
import { ResendEmailSender } from "@/lib/email/resend";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const sender = process.env.RESEND_API_KEY ? new ResendEmailSender() : new StubEmailSender();
  const result = await drainPendingReports(supabase, sender);

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_drain_emails",
    metadata: {
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
    },
  });

  return NextResponse.json(result);
}
