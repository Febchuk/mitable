import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export interface AuthedUser {
  userId: string;
  schoolId: string;
  role: "admin" | "teacher";
  email: string;
}

/**
 * Loads the authenticated user + their `users` profile. Returns either an
 * AuthedUser or an early NextResponse to short-circuit the route.
 */
export async function requireUser(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }
  const { data: profile, error } = await supabase
    .from("users")
    .select("id, school_id, role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: "User profile missing" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    user: {
      userId: profile.id as string,
      schoolId: profile.school_id as string,
      role: profile.role as "admin" | "teacher",
      email: profile.email as string,
    },
  };
}

/**
 * Confirms the user has an active classroom_teacher_assignment for the given
 * classroom. Use before any teacher-only write.
 */
export async function requireTeacherForClassroom(classroomId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("classroom_teacher_assignments")
    .select("id")
    .eq("teacher_user_id", user.id)
    .eq("classroom_id", classroomId)
    .is("end_date", null)
    .maybeSingle();
  return !!data && !error;
}
