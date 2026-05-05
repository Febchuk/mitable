import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

/** Revoke a pending invitation. Soft-claim with claimed_at=now() so the audit
 * trail and unique token_hash row remain intact, but the token is no longer
 * accepted at the claim endpoint. We do NOT delete the row.
 * Uses service-role; requireAdmin is the gate. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("teacher_invitations")
    .select("id, email, school_id, claimed_at")
    .eq("id", id)
    .maybeSingle();
  const inv = existing as
    | { id: string; email: string; school_id: string; claimed_at: string | null }
    | null;
  if (!inv || inv.school_id !== auth.user.schoolId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (inv.claimed_at) {
    return NextResponse.json(
      { error: "Invitation already claimed; revoke not applicable" },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("teacher_invitations")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_revoke_teacher_invite",
    target_table: "teacher_invitations",
    target_id: id,
    metadata: { email: inv.email },
  });

  return NextResponse.json({ ok: true });
}
