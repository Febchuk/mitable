import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface ActiveClassroom {
  id: string;
  name: string;
  code: string | null;
  role: "lead" | "support" | "assistant" | null;
}

export async function getActiveClassroomForCurrentUser(): Promise<ActiveClassroom | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // First try the join. Works whenever RLS lets us read both
  // classroom_teacher_assignments AND classrooms — i.e. the JWT hook is
  // registered and `school_id` is present in the token.
  const joined = await supabase
    .from("classroom_teacher_assignments")
    .select("classroom_role, classrooms ( id, name, code )")
    .eq("teacher_user_id", user.id)
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (joined.data) {
    const c = (
      joined.data as unknown as {
        classrooms: { id: string; name: string; code: string | null } | null;
      }
    ).classrooms;
    if (c) {
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        role: (joined.data.classroom_role as ActiveClassroom["role"]) ?? null,
      };
    }
  }

  // Fallback: split into two queries. Avoids depending on the cross-table
  // RLS join + the JWT `school_id` claim. The two SELECT policies that
  // matter here are "scoped read classroom_teachers" (line 45 of 0002_rls)
  // and "scoped read classrooms" (line 43); both still pass when the user's
  // profile is in the school, even if the join planner stumbles on the
  // claim.
  const a = await supabase
    .from("classroom_teacher_assignments")
    .select("classroom_id, classroom_role")
    .eq("teacher_user_id", user.id)
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!a.data) return null;
  const assignment = a.data as {
    classroom_id: string;
    classroom_role: ActiveClassroom["role"];
  };
  const c = await supabase
    .from("classrooms")
    .select("id, name, code")
    .eq("id", assignment.classroom_id)
    .maybeSingle();
  if (!c.data) return null;
  const classroom = c.data as { id: string; name: string; code: string | null };
  return {
    id: classroom.id,
    name: classroom.name,
    code: classroom.code,
    role: assignment.classroom_role,
  };
}

export interface CurrentUserContext {
  userId: string;
  schoolId: string;
  role: "admin" | "teacher";
  email: string;
  firstName: string | null;
}

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, school_id, role, email, first_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.id as string,
    schoolId: data.school_id as string,
    role: data.role as "admin" | "teacher",
    email: (data.email as string) ?? user.email ?? "",
    firstName: (data.first_name as string | null) ?? null,
  };
}
