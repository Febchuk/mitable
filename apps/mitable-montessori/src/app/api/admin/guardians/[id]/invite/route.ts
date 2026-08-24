import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  invalidateActiveInvitations,
  issueInvitation,
  InvitationError,
} from "@/lib/parents/invitations";
import { sendGuardianInviteEmail } from "@/lib/email/resend";
import { getAppUrl } from "@/lib/utils/app-url";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();

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
    await invalidateActiveInvitations({ supabase, guardianId: id });
    const result = await issueInvitation({
      supabase,
      guardianId: id,
      invitedByUserId: auth.user.userId,
    });

    const [{ data: school }, { data: inviter }] = await Promise.all([
      supabase.from("schools").select("name").eq("id", auth.user.schoolId).maybeSingle(),
      supabase
        .from("users")
        .select("first_name, last_name, email")
        .eq("id", auth.user.userId)
        .maybeSingle(),
    ]);
    const inviterRow = inviter as {
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
    const inviterName = inviterRow
      ? [inviterRow.first_name, inviterRow.last_name].filter(Boolean).join(" ").trim() ||
        inviterRow.email
      : "A school administrator";
    const inviteUrl = `${getAppUrl(req)}/parents/claim?token=${encodeURIComponent(result.token)}`;
    await sendGuardianInviteEmail({
      to: (guardian as { email: string }).email,
      inviteUrl,
      schoolName: (school as { name?: string } | null)?.name ?? "your school",
      inviterName,
    });

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_invite_guardian",
      target_table: "guardians",
      target_id: id,
      metadata: { invitation_id: result.invitationId, expires_at: result.expiresAt },
    });

    return NextResponse.json({
      ok: true,
      invitationId: result.invitationId,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
