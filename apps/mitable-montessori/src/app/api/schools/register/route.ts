import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Public school registration. Creates a brand-new `schools` row and a `users`
 * row (role=admin, status=active) tied to a Supabase auth user.
 *
 * Two flows:
 *   1. Password flow — body has `password`. We create the auth user via the
 *      service-role admin API with email_confirm true (same pattern as teacher
 *      invite claim). Plain signUp leaves emails unconfirmed when the project
 *      requires confirmation, and the client-side sign-in right after fails.
 *   2. Google flow — no password. The user already authenticated via OAuth
 *      and was bounced to /signup?provider=google&email=... by the callback
 *      route. We use the existing session and just write schools + users.
 *
 * Failure handling: if school/user inserts fail AFTER an auth user was created
 * via password signup, we delete the auth user so the email is reusable.
 */

const RegisterSchema = z.object({
  schoolName: z.string().trim().min(2).max(120),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200).optional(),
});

const DEFAULT_TIMEZONE = "America/New_York";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { schoolName, firstName, lastName, email, password } = parsed.data;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const admin = createAdminClient();

  // ── Resolve the auth user. Either we already have one (Google flow) or we
  // create one with email/password.
  let authUserId: string;
  let createdAuthUser = false;

  if (password) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });
    if (created.error) {
      const message = created.error.message ?? "";
      const lower = message.toLowerCase();
      const alreadyExists =
        lower.includes("already") || lower.includes("exists") || lower.includes("registered");
      if (!alreadyExists) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const foundId = await findAuthUserByEmail(admin, email);
      if (!foundId) {
        return NextResponse.json(
          { error: "Could not create or recover auth account" },
          { status: 400 }
        );
      }
      authUserId = foundId;
      createdAuthUser = false;
    } else if (!created.data.user) {
      return NextResponse.json({ error: "Auth signup returned no user" }, { status: 400 });
    } else {
      authUserId = created.data.user.id;
      createdAuthUser = true;
    }
  } else {
    // Google flow — must already be authenticated.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not signed in. Use email + password or sign in with Google first." },
        { status: 401 }
      );
    }
    if (user.email?.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "Email does not match the signed-in Google account." },
        { status: 400 }
      );
    }
    authUserId = user.id;
  }

  // ── Refuse to create a second `users` row for the same auth user.
  const { data: existing } = await admin
    .from("users")
    .select("id, school_id")
    .eq("id", authUserId)
    .maybeSingle();
  if (existing) {
    // Don't roll back auth — they're already a real user; just block the dupe.
    return NextResponse.json(
      { error: "This account is already linked to a school." },
      { status: 409 }
    );
  }

  // ── Create the school.
  const { data: school, error: schoolErr } = await admin
    .from("schools")
    .insert({
      name: schoolName,
      timezone: DEFAULT_TIMEZONE,
      status: "active",
    })
    .select("id")
    .single();
  if (schoolErr || !school) {
    if (createdAuthUser) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    return NextResponse.json(
      { error: schoolErr?.message ?? "Could not create school" },
      { status: 500 }
    );
  }

  // ── Create the per-school crypto salt. The client-side bootstrap
  // (/api/v1/sync/pull) requires this row to exist before it can derive
  // Dexie at-rest encryption keys. Mirrors the pattern in supabase/seed.ts.
  const salt = randomBytes(32).toString("base64");
  const { error: saltErr } = await admin
    .from("school_crypto_salts")
    .insert({ school_id: school.id, salt });
  if (saltErr) {
    await admin.from("schools").delete().eq("id", school.id);
    if (createdAuthUser) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    return NextResponse.json(
      { error: saltErr.message ?? "Could not create school crypto salt" },
      { status: 500 }
    );
  }

  // ── Create the admin user row (id matches auth.users.id).
  const { error: userErr } = await admin.from("users").insert({
    id: authUserId,
    school_id: school.id,
    role: "admin",
    first_name: firstName,
    last_name: lastName,
    email,
    status: "active",
  });
  if (userErr) {
    // Roll back: drop the salt + school so the next attempt is clean.
    // Salt has FK to schools(id), so it must go first.
    await admin.from("school_crypto_salts").delete().eq("school_id", school.id);
    await admin.from("schools").delete().eq("id", school.id);
    if (createdAuthUser) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    return NextResponse.json(
      { error: userErr.message ?? "Could not create admin user" },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: authUserId,
    actor_role: "admin",
    action: "school_register",
    target_table: "schools",
    target_id: school.id,
    metadata: { source: password ? "password" : "google" },
  });

  return NextResponse.json({
    ok: true,
    schoolId: school.id,
    redirect: "/onboarding/privacy",
  });
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return null;
  const lower = email.toLowerCase();
  const found = data.users.find((u) => u.email?.toLowerCase() === lower);
  return found?.id ?? null;
}
