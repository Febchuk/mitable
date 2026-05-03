import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * DEV-ONLY: assign the currently logged-in user to a classroom as a teacher.
 *
 * The seed script creates teacher@example.school + Cypress Room. If you signed
 * up as a different user, this endpoint wires you into the seeded classroom
 * (or any classroom you pass) so the teacher views light up.
 *
 * Refuses to run when NODE_ENV === 'production'. The classroom_id defaults to
 * the most recently created active classroom in the user's school.
 */

const BodySchema = z.object({
  classroom_id: z.string().uuid().optional(),
  role: z.enum(["lead", "support", "assistant"]).default("lead"),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ensure the user has a public.users row. If not, mirror the seeded school
  // so RLS policies see a school_id.
  const { data: profile } = await admin
    .from("users")
    .select("id, school_id, role")
    .eq("id", user.id)
    .maybeSingle();

  let schoolId = (profile as { school_id: string } | null)?.school_id ?? null;

  if (!profile) {
    // Pick the first school as a fallback (seed creates one).
    const { data: schools } = await admin
      .from("schools")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1);
    schoolId = (schools?.[0] as { id: string } | undefined)?.id ?? null;
    if (!schoolId) {
      return NextResponse.json(
        { error: "No school exists yet. Run pnpm supabase:seed first." },
        { status: 400 }
      );
    }
    const { error: insErr } = await admin.from("users").insert({
      id: user.id,
      school_id: schoolId,
      role: "teacher",
      first_name: user.user_metadata?.first_name ?? "New",
      last_name: user.user_metadata?.last_name ?? "Teacher",
      email: user.email ?? `${user.id}@example.local`,
      status: "active",
    });
    if (insErr) {
      return NextResponse.json(
        { error: `Could not create user profile: ${insErr.message}` },
        { status: 500 }
      );
    }
  }

  // Pick the classroom: explicit, or the most recent active one in the school.
  let classroomId = parsed.data.classroom_id;
  if (!classroomId) {
    const { data: classrooms } = await admin
      .from("classrooms")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    classroomId = (classrooms?.[0] as { id: string } | undefined)?.id;
    if (!classroomId) {
      return NextResponse.json(
        { error: "No active classroom in this school. Run pnpm supabase:seed first." },
        { status: 400 }
      );
    }
  }

  // Idempotent: if there's already an active assignment for this teacher +
  // classroom, return it. Otherwise create one.
  const { data: existing } = await admin
    .from("classroom_teacher_assignments")
    .select("id")
    .eq("teacher_user_id", user.id)
    .eq("classroom_id", classroomId)
    .is("end_date", null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_assigned: true,
      assignment_id: (existing as { id: string }).id,
      classroom_id: classroomId,
    });
  }

  const { data: created, error: assignErr } = await admin
    .from("classroom_teacher_assignments")
    .insert({
      teacher_user_id: user.id,
      classroom_id: classroomId,
      classroom_role: parsed.data.role,
      start_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (assignErr) {
    return NextResponse.json({ error: `Assignment failed: ${assignErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    assignment_id: (created as { id: string }).id,
    classroom_id: classroomId,
  });
}
