import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * DEV-ONLY diagnostic. Returns the full state of the current session as the
 * server sees it:
 *   - The auth user (Supabase Auth) — id + email
 *   - The matching users row (school + role) — null if missing
 *   - JWT claims actually present in the access token (so you can see if the
 *     custom_access_token_hook ran)
 *   - All classroom_teacher_assignments for this auth user (read via service
 *     role so we bypass RLS and tell you the truth on the table)
 *   - All classrooms in the user's school (service role)
 *
 * Use this to figure out which link is broken when the teacher dashboard says
 * "No active classroom" despite being logged in as the seeded teacher.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const admin = createAdminClient();

  const { data: sessionData } = await supabase.auth.getSession();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ ok: false, reason: "no_session" });
  }

  // Decode the JWT payload (no signature verification — debug only) so we
  // can show whether `school_id` and `role` made it into the token.
  let jwtClaims: Record<string, unknown> = {};
  try {
    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      const parts = accessToken.split(".");
      if (parts.length >= 2) {
        const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
        jwtClaims = JSON.parse(
          Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        );
      }
    }
  } catch {
    // ignore — surface as missing
  }

  // Service-role reads — these tell us the on-disk truth.
  const { data: profile } = await admin
    .from("users")
    .select("id, school_id, role, email, first_name, last_name, status")
    .eq("id", user.id)
    .maybeSingle();

  const { data: assignments } = await admin
    .from("classroom_teacher_assignments")
    .select("id, classroom_id, classroom_role, start_date, end_date")
    .eq("teacher_user_id", user.id);

  const schoolId = (profile as { school_id?: string } | null)?.school_id ?? null;
  const { data: classroomsInSchool } = schoolId
    ? await admin.from("classrooms").select("id, name, code, status").eq("school_id", schoolId)
    : { data: [] };

  // Also check whether the teacher's seeded auth user matches any auth.users
  // row by email — covers the "I logged in as teacher@example.school but a
  // fresh signup created a new auth UUID" failure mode.
  const teacherEmail = "teacher@example.school";
  const { data: teacherSeedRow } = await admin
    .from("users")
    .select("id, school_id, role")
    .eq("email", teacherEmail)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    auth: { id: user.id, email: user.email },
    jwtClaims: {
      sub: jwtClaims.sub,
      role: jwtClaims.role,
      // The custom hook adds `school_id` and an app `role`. If these are
      // missing, the access-token hook isn't registered in Supabase Studio.
      school_id: jwtClaims.school_id,
      app_role: typeof jwtClaims.role === "string" ? jwtClaims.role : undefined,
    },
    profile: profile ?? null,
    assignments: assignments ?? [],
    classroomsInSchool: classroomsInSchool ?? [],
    teacherSeedRow: teacherSeedRow ?? null,
    notes: {
      profileMissing: !profile,
      assignmentsMissing: !assignments || assignments.length === 0,
      authIdMatchesSeededTeacher: teacherSeedRow
        ? (teacherSeedRow as { id: string }).id === user.id
        : null,
    },
  });
}
