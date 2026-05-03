import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { drainPendingReports, StubEmailSender } from "@/lib/admin/email-worker";

/**
 * Admin-triggered drain. The production sender (Resend / Postmark) is wired
 * here once credentials land; until then the stub no-ops and marks rows as
 * sent so the workflow can be exercised end-to-end. Pin the production sender
 * with an env-gated branch when it ships.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const sender = new StubEmailSender();
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
