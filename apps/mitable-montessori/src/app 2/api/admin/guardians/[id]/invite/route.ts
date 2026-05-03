import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { issueInvitation, InvitationError } from "@/lib/parents/invitations";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verify the guardian belongs to this admin's school. RLS would block
  // cross-school writes regardless, but we want a clean 404 over a 403.
  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, email, school_id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!guardian || (guardian as { school_id: string }).school_id !== auth.user.schoolId) {
    return NextResponse.json({ error: "Guardian not found" }, { status: 404 });
  }
  if (!(guardian as { email: string | null }).email) {
    return NextResponse.json(
      { error: "Guardian has no email on file; add one before inviting" },
      { status: 400 }
    );
  }

  try {
    const result = await issueInvitation({
      supabase,
      guardianId: id,
      invitedByUserId: auth.user.userId,
    });

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_invite_guardian",
      target_table: "guardians",
      target_id: id,
      metadata: { invitation_id: result.invitationId, expires_at: result.expiresAt },
    });

    // The plaintext token is returned to the admin so they can preview the
    // claim URL before the email goes out. Production also dispatches the
    // email via the email worker; that wiring is out of scope here.
    return NextResponse.json({
      ok: true,
      invitationId: result.invitationId,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
