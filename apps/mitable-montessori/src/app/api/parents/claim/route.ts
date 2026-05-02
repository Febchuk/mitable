import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { createClient } from "@/utils/supabase/server";
import { claimInvitation, InvitationError } from "@/lib/parents/invitations";

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
 *   3. supabase.auth.signUp creates the Supabase Auth user
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

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // We need the canonical email for the invitation BEFORE creating the auth
  // user, so we resolve the invitation first. claimInvitation re-validates +
  // marks claimed at the end, after auth signup succeeds.
  const tokenHash = await sha256Hex(parsed.data.token);
  const { data: invitation } = await supabase
    .from("guardian_invitations")
    .select("id, guardian_id, expires_at, claimed_at, guardians(email)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  const inv = invitation as {
    id: string;
    guardian_id: string;
    expires_at: string;
    claimed_at: string | null;
    guardians: { email: string | null } | { email: string | null }[] | null;
  };
  if (inv.claimed_at) {
    return NextResponse.json({ error: "Invitation already claimed" }, { status: 409 });
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  }
  const g = Array.isArray(inv.guardians) ? inv.guardians[0] : inv.guardians;
  const email = g?.email;
  if (!email) {
    return NextResponse.json({ error: "Guardian email missing" }, { status: 400 });
  }

  // Create the Supabase Auth user with the canonical email.
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
  });
  if (signUpErr || !signUpData.user) {
    return NextResponse.json(
      { error: signUpErr?.message ?? "Auth signup failed" },
      { status: 500 }
    );
  }

  try {
    const result = await claimInvitation({
      supabase,
      token: parsed.data.token,
      authUserId: signUpData.user.id,
    });
    await auditLog({
      actor_id: signUpData.user.id,
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
