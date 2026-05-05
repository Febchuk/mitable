import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  claimTeacherInvitation,
  InvitationError,
  lookupInvitation,
} from "@/lib/teachers/invitations";

const ClaimSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

/**
 * Teacher self-service claim.
 *
 * Order of operations (all via service-role since the user has no JWT yet):
 *   1. Validate token (lookup only — bail early if expired/claimed).
 *   2. auth.admin.createUser with the canonical email from the invitation.
 *      If the auth user already exists from an earlier failed attempt, fetch
 *      it instead and continue (idempotent retry).
 *   3. Insert the public.users row with id = auth user id.
 *   4. Stamp teacher_invitations.claimed_at + claimed_user_id.
 *
 * Why auth.admin.createUser instead of supabase.auth.signUp:
 *   - signUp goes through Supabase Auth's signup rate limit (which we hit).
 *   - admin.createUser bypasses that and lets us mark the user email_confirmed
 *     up-front (the invite link itself proves email ownership).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Validate the token. Use service-role so RLS doesn't block the
  // unauthenticated invitee from reading their own invitation.
  let invitation;
  try {
    invitation = await lookupInvitation(admin, parsed.data.token);
  } catch (err) {
    if (err instanceof InvitationError) {
      const status =
        err.code === "not_found" ? 404 : err.code === "expired" ? 410 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[claim] lookup failed", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // 2. Create the auth user (or recover an existing one from a half-failed retry).
  let authUserId: string;
  const created = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(),
    },
  });
  if (created.error) {
    const message = created.error.message ?? "";
    const lower = message.toLowerCase();
    const alreadyExists =
      lower.includes("already") ||
      lower.includes("exists") ||
      lower.includes("registered");
    if (!alreadyExists) {
      console.error("[claim] auth.admin.createUser failed", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    // Recover the existing auth user by email.
    const found = await findAuthUserByEmail(admin, invitation.email);
    if (!found) {
      console.error("[claim] createUser said exists but lookup found nothing", { email: invitation.email });
      return NextResponse.json(
        { error: "Auth user exists but couldn't be located. Please contact support." },
        { status: 500 }
      );
    }
    authUserId = found;
  } else if (!created.data.user) {
    console.error("[claim] createUser returned no user");
    return NextResponse.json({ error: "Auth signup returned no user" }, { status: 500 });
  } else {
    authUserId = created.data.user.id;
  }

  // 3. Insert the users row. If it already exists (retry path), update name + status.
  const { error: insertErr } = await admin.from("users").upsert(
    {
      id: authUserId,
      school_id: invitation.schoolId,
      role: "teacher",
      first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(),
      email: invitation.email,
      status: "active",
    },
    { onConflict: "id" }
  );
  if (insertErr) {
    console.error("[claim] users upsert failed", insertErr);
    return NextResponse.json(
      { error: insertErr.message, code: "users_insert_failed" },
      { status: 500 }
    );
  }

  // 4. Mark the invitation claimed.
  try {
    const result = await claimTeacherInvitation({
      supabase: admin,
      token: parsed.data.token,
      authUserId,
    });
    await auditLog({
      actor_id: authUserId,
      actor_role: "teacher",
      action: "teacher_claim_invitation",
      target_table: "teacher_invitations",
      target_id: result.invitationId,
      metadata: { school_id: result.schoolId },
    });
    return NextResponse.json({ ok: true, schoolId: result.schoolId });
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    console.error("[claim] claimTeacherInvitation failed", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** Read-only token preview for the claim page server component. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const invitation = await lookupInvitation(admin, token);
    const { data: school } = await admin
      .from("schools")
      .select("name")
      .eq("id", invitation.schoolId)
      .maybeSingle();
    return NextResponse.json({
      email: invitation.email,
      schoolName: (school as { name?: string } | null)?.name ?? "your school",
      expiresAt: invitation.expiresAt,
    });
  } catch (err) {
    if (err instanceof InvitationError) {
      const status =
        err.code === "not_found" ? 404 : err.code === "expired" ? 410 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[claim] GET preview failed", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  // Supabase doesn't expose a direct "get auth user by email" without paging;
  // listUsers gives us a way. For the volumes we expect (small schools), this
  // is fine. If we ever scale, switch to a database query against auth.users.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return null;
  const lower = email.toLowerCase();
  const found = data.users.find((u) => u.email?.toLowerCase() === lower);
  return found?.id ?? null;
}
