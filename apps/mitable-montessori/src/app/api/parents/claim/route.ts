import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/utils/supabase/admin";
import { claimInvitation, InvitationError, lookupInvitation } from "@/lib/parents/invitations";

const ClaimSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

/**
 * Guardian self-service claim. The user lands on /parents/claim?token=...,
 * sets a password, and POSTs here. We do four things in order:
 *   1. Find the invitation by hashed token (must be unclaimed + unexpired)
 *   2. Look up the canonical guardians.email so the auth account uses the
 *      address the admin invited (not whatever the user types — defense
 *      against an attacker swapping in their own email)
 *   3. Create the Supabase Auth user with its email already confirmed
 *   4. claimInvitation links auth_user_id → guardians.id and stamps claimed_at
 *
 * The JWT claim `guardian_id` is set by a Supabase auth hook reading
 * guardians.auth_user_id; that wiring lives in 0004_jwt_claims.sql conceptually
 * (and would be extended to include guardian_id for Phase 5).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  let invitation;
  try {
    invitation = await lookupInvitation(admin, parsed.data.token);
  } catch (err) {
    if (err instanceof InvitationError) {
      const status = err.code === "not_found" ? 404 : err.code === "expired" ? 410 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const created = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  let authUserId: string;
  if (created.error) {
    const message = created.error.message ?? "";
    const alreadyExists = /already|exists|registered/i.test(message);
    const existingId = alreadyExists ? await findAuthUserByEmail(admin, invitation.email) : null;
    if (!existingId) {
      return NextResponse.json(
        { error: message || "Could not create the account" },
        { status: 500 }
      );
    }
    authUserId = existingId;
  } else if (!created.data.user) {
    return NextResponse.json({ error: "Could not create the account" }, { status: 500 });
  } else {
    authUserId = created.data.user.id;
  }

  try {
    const result = await claimInvitation({
      supabase: admin,
      token: parsed.data.token,
      authUserId,
    });
    await auditLog({
      actor_id: authUserId,
      actor_role: "guardian",
      action: "guardian_claim_invitation",
      target_table: "guardians",
      target_id: result.guardianId,
      metadata: { invitation_id: result.invitationId },
    });
    return NextResponse.json({ ok: true, guardianId: result.guardianId });
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return null;
  const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}
