import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface ActiveClassroom {
  id: string;
  name: string;
  code: string | null;
  role: "lead" | "support" | "assistant" | null;
}

/** Same shape as ActiveClassroom — one entry per active teacher assignment. */
export type TeacherClassroom = ActiveClassroom;

const ELEMENTARY_CLASSROOM_CODES = new Set(["Lower Elementary", "Upper Elementary"]);

export function isElementaryClassroomCode(code: string | null | undefined): boolean {
  return !!code && ELEMENTARY_CLASSROOM_CODES.has(code);
}

export async function teacherShouldSeeGrades(): Promise<boolean> {
  return (await listTeacherClassroomsForCurrentUser()).some((classroom) =>
    isElementaryClassroomCode(classroom.code)
  );
}

export function isToddlerClassroomCode(code: string | null | undefined): boolean {
  return code?.trim().toLowerCase() === "toddler";
}

export async function teacherShouldSeeDailyLog(): Promise<boolean> {
  return (await listTeacherClassroomsForCurrentUser()).some((classroom) =>
    isToddlerClassroomCode(classroom.code)
  );
}

export async function teacherShouldSeeProgress(): Promise<boolean> {
  return (await listTeacherClassroomsForCurrentUser()).some(
    (classroom) => !isToddlerClassroomCode(classroom.code)
  );
}

type ClassroomProgram = "montessori" | "iep" | "speech";

type AssignedTeacherClassroom = ActiveClassroom & {
  startDate: string;
  programs: ClassroomProgram[];
};

type AuthenticatedUser = { id: string; email: string | null };

/** One verified account lookup per request, shared by the app shell's queries. */
const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const requestHeaders = await headers();
  const id = requestHeaders.get("x-mitable-auth-user-id");
  const email = requestHeaders.get("x-mitable-auth-user-email");
  if (id) return { id, email };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});

/**
 * Loads the active classroom assignments once, then lets the shell derive the
 * current classroom, switcher list, and program flags from the same result.
 */
const listAssignedTeacherClassrooms = cache(async (): Promise<AssignedTeacherClassroom[]> => {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: assignments } = await supabase
    .from("classroom_teacher_assignments")
    .select("classroom_role, start_date, classrooms(id, name, code, ui_hidden, program_types)")
    .eq("teacher_user_id", user.id)
    .is("end_date", null)
    .order("start_date", { ascending: false });
  if (!assignments?.length) return [];

  const classrooms: AssignedTeacherClassroom[] = [];
  const seenClassroomIds = new Set<string>();
  for (const assignment of assignments as Array<{
    classroom_role: ActiveClassroom["role"];
    start_date: string;
    classrooms:
      | {
          id: string;
          name: string;
          code: string | null;
          ui_hidden?: boolean;
          program_types?: string[] | null;
        }
      | {
          id: string;
          name: string;
          code: string | null;
          ui_hidden?: boolean;
          program_types?: string[] | null;
        }[]
      | null;
  }>) {
    const classroom = Array.isArray(assignment.classrooms)
      ? assignment.classrooms[0]
      : assignment.classrooms;
    if (!classroom || classroom.ui_hidden || seenClassroomIds.has(classroom.id)) continue;
    seenClassroomIds.add(classroom.id);
    classrooms.push({
      id: classroom.id,
      name: classroom.name,
      code: classroom.code,
      role: assignment.classroom_role ?? null,
      startDate: assignment.start_date,
      programs: normalizePrograms(classroom.program_types),
    });
  }

  return classrooms;
});

function normalizePrograms(programTypes: string[] | null | undefined): ClassroomProgram[] {
  if (!Array.isArray(programTypes) || programTypes.length === 0) return ["montessori"];
  return programTypes.filter(
    (program): program is ClassroomProgram =>
      program === "montessori" || program === "iep" || program === "speech"
  );
}

/**
 * Resolves which classroom a teacher is acting in. When `classroomId` is
 * supplied and the teacher has an active assignment to it, that room wins;
 * otherwise falls back to their most recent assignment (same rule as
 * `getClassroomProgress`).
 */
export const resolveClassroomForCurrentUser = cache(async function resolveClassroomForCurrentUser(
  classroomId?: string
): Promise<ActiveClassroom | null> {
  if (classroomId) {
    const all = await listTeacherClassroomsForCurrentUser();
    const found = all.find((c) => c.id === classroomId);
    if (found) return found;
  }
  return getActiveClassroomForCurrentUser();
});

export const getActiveClassroomForCurrentUser = cache(
  async function getActiveClassroomForCurrentUser(): Promise<ActiveClassroom | null> {
    const classroom = (await listAssignedTeacherClassrooms())[0];
    if (!classroom) return null;
    return {
      id: classroom.id,
      name: classroom.name,
      code: classroom.code,
      role: classroom.role,
    };
  }
);

/**
 * Returns every classroom the current teacher has an active assignment to,
 * sorted by name. The single-classroom `getActiveClassroomForCurrentUser`
 * picks the most recent of these; this returns all of them so the teacher
 * can switch between rooms on the Progress / Curriculum / Attendance pages.
 */
export const listTeacherClassroomsForCurrentUser = cache(
  async function listTeacherClassroomsForCurrentUser(): Promise<TeacherClassroom[]> {
    return (await listAssignedTeacherClassrooms())
      .map((classroom) => ({
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        role: classroom.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
);

export interface CurrentUserContext {
  userId: string;
  schoolId: string;
  schoolName: string | null;
  role: "admin" | "teacher";
  email: string;
  firstName: string | null;
  privacyAcknowledgedAt: string | null;
}

export const getCurrentUserContext = cache(
  async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
    const user = await getAuthenticatedUser();
    if (!user) return null;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data } = await supabase
      .from("users")
      .select("id, school_id, role, email, first_name, privacy_acknowledged_at, schools(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;

    const row = data as typeof data & {
      schools: { name: string | null } | { name: string | null }[] | null;
    };
    const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;

    return {
      userId: row.id as string,
      schoolId: row.school_id as string,
      schoolName: school?.name ?? null,
      role: row.role as "admin" | "teacher",
      email: (row.email as string) ?? user.email ?? "",
      firstName: (row.first_name as string | null) ?? null,
      privacyAcknowledgedAt: (row.privacy_acknowledged_at as string | null) ?? null,
    };
  }
);

/**
 * Whether the signed-in teacher should see the IEP progress mode. True only when
 * they have at least one active assignment to a classroom that includes the
 * IEP program and at least one that includes Montessori (often the same room).
 */
export async function teacherShouldSeeIepProgressTab(): Promise<boolean> {
  const classrooms = await listAssignedTeacherClassrooms();
  return (
    classrooms.some((classroom) => classroom.programs.includes("montessori")) &&
    classrooms.some((classroom) => classroom.programs.includes("iep"))
  );
}

/** True when the teacher has any active assignment to a classroom that includes Speech. */
export async function teacherShouldSeeSpeechProgressTab(): Promise<boolean> {
  return (await listAssignedTeacherClassrooms()).some((classroom) =>
    classroom.programs.includes("speech")
  );
}
