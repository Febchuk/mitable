import { NextResponse } from "next/server";
import { z } from "zod";
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

/**
 * Why service-role here: the user-scoped client honours RLS, but RLS on
 * teacher_invitations relies on the JWT carrying `role=admin` + `school_id`,
 * which requires the Custom Access Token Hook to be configured. requireAdmin()
 * already enforces admin-ness from the canonical users row, so we can safely
 * write with service-role and treat requireAdmin as the actual authz gate.
 */

/**
 * Bulk-invite teachers by email. Per-email outcomes are returned in three
 * buckets so the UI can show a partial-success toast ("3 sent, 1 already on
 * your team, 1 failed to send"). We never fail the whole request because of
 * one bad email — that punishes the admin for batching.
 *
 * Idempotency: if there's already an unclaimed invitation for an email, we
 * mark it claimed_at=now() (invalidating the prior token) and issue a fresh
 * one with a new 14-day TTL. Resending in the UI also routes through this.
 *
 * Cross-school note: the same email *can* legitimately exist as an Active
 * teacher in a different school — we only check against the inviting admin's
 * school for the "already_active" skip.
 */

const InviteSchema = z.object({
  emails: z.array(z.string()).min(1).max(100),
});

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SchoolMeta {
  schoolName: string;
  inviterName: string;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Resolve school name + inviter name once for the email template.
  const meta = await loadSchoolMeta(supabase, auth.user.schoolId, auth.user.userId);

  // Pull the school's existing teacher emails so we can short-circuit.
  const { data: existingUsers } = await supabase
    .from("users")
    .select("email, status")
    .eq("school_id", auth.user.schoolId)
    .eq("role", "teacher");
  const activeEmailSet = new Set(
    (existingUsers ?? [])
      .filter((u) => (u as { status: string }).status === "active")
      .map((u) => (u as { email: string }).email.toLowerCase())
  );

  const sent: Array<{ email: string; invitationId: string; expiresAt: string }> = [];
  const skipped: Array<{ email: string; reason: "already_active" | "invalid" | "duplicate" }> = [];
  const errors: Array<{ email: string; error: string }> = [];

  // De-dup the input list so the same email doesn't get two invites.
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const raw of parsed.data.emails) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!EMAIL_RX.test(trimmed)) {
      skipped.push({ email: trimmed, reason: "invalid" });
      continue;
    }
    if (seen.has(lower)) {
      skipped.push({ email: trimmed, reason: "duplicate" });
      continue;
    }
    seen.add(lower);
    if (activeEmailSet.has(lower)) {
      skipped.push({ email: trimmed, reason: "already_active" });
      continue;
    }
    queue.push(trimmed);
  }

  const appUrl = getAppUrl(req);

  for (const email of queue) {
    try {
      // Invalidate any prior unclaimed invite for this email so only one live
      // token exists at a time.
      await invalidateActiveInvites({
        supabase,
        schoolId: auth.user.schoolId,
        email,
      });

      const result = await issueTeacherInvitation({
        supabase,
        schoolId: auth.user.schoolId,
        email,
        invitedByUserId: auth.user.userId,
      });

      const inviteUrl = `${appUrl}/teachers/claim?token=${encodeURIComponent(result.token)}`;
      try {
        await sendTeacherInviteEmail({
          to: email,
          inviteUrl,
          schoolName: meta.schoolName,
          inviterName: meta.inviterName,
        });
      } catch (sendErr) {
        // Email failed — surface the error but leave the invitation row in
        // place so the admin can resend (which re-issues + re-sends).
        const message = (sendErr as Error).message ?? "Email delivery failed";
        console.error("[invite-teacher] Resend send failed", { email, message });
        errors.push({ email, error: message });
        continue;
      }

      await auditLog({
        actor_id: auth.user.userId,
        actor_role: auth.user.role,
        action: "admin_invite_teacher",
        target_table: "teacher_invitations",
        target_id: result.invitationId,
        metadata: { email, expires_at: result.expiresAt },
      });

      sent.push({
        email,
        invitationId: result.invitationId,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      const msg =
        err instanceof InvitationError ? err.message : (err as Error).message ?? "Failed";
      errors.push({ email, error: msg });
    }
  }

  return NextResponse.json({ sent, skipped, errors });
}

async function loadSchoolMeta(
  supabase: ReturnType<typeof createAdminClient>,
  schoolId: string,
  inviterId: string
): Promise<SchoolMeta> {
  const [{ data: school }, { data: inviter }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", inviterId)
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
  return { schoolName, inviterName };
}
