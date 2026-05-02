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

  const { data, error } = await supabase
    .from("classroom_teacher_assignments")
    .select("classroom_role, classrooms ( id, name, code )")
    .eq("teacher_user_id", user.id)
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const c = (data as unknown as { classrooms: { id: string; name: string; code: string | null } })
    .classrooms;
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    role: (data.classroom_role as ActiveClassroom["role"]) ?? null,
  };
}

export interface CurrentUserContext {
  userId: string;
  schoolId: string;
  role: "admin" | "teacher";
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
    .select("id, school_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.id as string,
    schoolId: data.school_id as string,
    role: data.role as "admin" | "teacher",
  };
}
