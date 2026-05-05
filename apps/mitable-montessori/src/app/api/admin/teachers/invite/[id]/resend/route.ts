import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  invalidateActiveInvites,
  issueTeacherInvitation,
  InvitationError,
} from "@/lib/teachers/invitations";
import { sendTeacherInviteEmail } from "@/lib/email/resend";
import { getAppUrl } from "@/lib/utils/app-url";

/** Re-issue the token + send a fresh invite email for the same email address.
 * Uses service-role for the same reason as the bulk-invite route. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();

  // Verify the invitation belongs to this admin's school.
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
      { error: "Invitation already claimed" },
      { status: 409 }
    );
  }

  // Resolve school + inviter name for the email template.
  const [{ data: school }, { data: inviter }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", auth.user.schoolId).maybeSingle(),
    supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", auth.user.userId)
      .maybeSingle(),
  ]);
  const schoolName = (school as { name?: string } | null)?.name ?? "your school";
  const inviterRow = inviter as
    | { first_name: string | null; last_name: string | null; email: string }
    | null;
  const inviterName = inviterRow
    ? [inviterRow.first_name, inviterRow.last_name].filter(Boolean).join(" ").trim() ||
      inviterRow.email
    : "An admin";

  try {
    await invalidateActiveInvites({
      supabase,
      schoolId: auth.user.schoolId,
      email: inv.email,
    });

    const result = await issueTeacherInvitation({
      supabase,
      schoolId: auth.user.schoolId,
      email: inv.email,
      invitedByUserId: auth.user.userId,
    });

    const inviteUrl = `${getAppUrl(req)}/teachers/claim?token=${encodeURIComponent(result.token)}`;
    await sendTeacherInviteEmail({
      to: inv.email,
      inviteUrl,
      schoolName,
      inviterName,
    });

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_resend_teacher_invite",
      target_table: "teacher_invitations",
      target_id: result.invitationId,
      metadata: { email: inv.email, prior_invitation_id: inv.id },
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
