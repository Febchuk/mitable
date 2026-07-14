/**
 * Soft-hide for classrooms / teachers in the default UI.
 *
 * School-scoped flags live on `classrooms.ui_hidden` and `users.ui_hidden`.
 * Admins may opt into revealing them via the `X-Mitable-Reveal-Hidden` header
 * (or the companion cookie for SSR). Teachers always see the filtered view.
 */

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REVEAL_HIDDEN_COOKIE, REVEAL_HIDDEN_HEADER } from "@/lib/visibility/ui-hidden-shared";

export {
  REVEAL_HIDDEN_COOKIE,
  REVEAL_HIDDEN_HEADER,
  REVEAL_HIDDEN_STORAGE_KEY,
} from "@/lib/visibility/ui-hidden-shared";

export function shouldFilterUiHidden(
  role: "admin" | "teacher" | string,
  revealHiddenRequested: boolean
): boolean {
  if (role !== "admin") return true;
  return !revealHiddenRequested;
}

/** True when the request asks an admin to see ui_hidden entities. */
export function revealHiddenFromRequest(req: Request): boolean {
  const header = req.headers.get(REVEAL_HIDDEN_HEADER);
  if (header === "1" || header?.toLowerCase() === "true") return true;
  const cookie = req.headers.get("cookie") ?? "";
  return /(?:^|;\s*)mitable\.revealHidden=1(?:;|$)/.test(cookie);
}

/** For RSC / cookie-only paths (e.g. admin Today). */
export async function revealHiddenFromCookies(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(REVEAL_HIDDEN_COOKIE)?.value === "1";
}

export type UiHiddenSets = {
  classroomIds: Set<string>;
  teacherIds: Set<string>;
};

export async function loadUiHiddenSets(
  supabase: SupabaseClient,
  schoolId: string
): Promise<UiHiddenSets> {
  const [{ data: rooms }, { data: teachers }] = await Promise.all([
    supabase.from("classrooms").select("id").eq("school_id", schoolId).eq("ui_hidden", true),
    supabase
      .from("users")
      .select("id")
      .eq("school_id", schoolId)
      .eq("role", "teacher")
      .eq("ui_hidden", true),
  ]);

  return {
    classroomIds: new Set((rooms ?? []).map((r) => (r as { id: string }).id)),
    teacherIds: new Set((teachers ?? []).map((u) => (u as { id: string }).id)),
  };
}

/** Keep classrooms that are not ui_hidden (or all when not filtering). */
export function filterHiddenClassroomIds(
  classroomIds: string[],
  hidden: Set<string>,
  filter: boolean
): string[] {
  if (!filter) return classroomIds;
  return classroomIds.filter((id) => !hidden.has(id));
}

/**
 * Student stays visible if they have at least one active enrollment in a
 * non-hidden classroom. Returns the visible classroom ids for that student.
 */
export function visibleClassroomIdsForStudent(
  activeClassroomIds: string[],
  hiddenClassroomIds: Set<string>,
  filter: boolean
): string[] | null {
  if (!filter) return activeClassroomIds;
  const visible = activeClassroomIds.filter((id) => !hiddenClassroomIds.has(id));
  if (visible.length === 0) return null;
  return visible;
}

/**
 * Drop students whose active enrollments are only in ui_hidden classrooms.
 * Unassigned students (no active enrollments) stay visible.
 */
export async function filterStudentIdsByUiHidden(
  supabase: SupabaseClient,
  studentIds: string[],
  hiddenClassroomIds: Set<string>,
  filter: boolean
): Promise<Set<string>> {
  if (!filter || hiddenClassroomIds.size === 0 || studentIds.length === 0) {
    return new Set(studentIds);
  }
  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id, classroom_id")
    .in("student_id", studentIds)
    .is("end_date", null);

  const enrolled = new Set<string>();
  const visible = new Set<string>();
  for (const e of enrollments ?? []) {
    const row = e as { student_id: string; classroom_id: string };
    enrolled.add(row.student_id);
    if (!hiddenClassroomIds.has(row.classroom_id)) {
      visible.add(row.student_id);
    }
  }
  return new Set(studentIds.filter((id) => visible.has(id) || !enrolled.has(id)));
}
