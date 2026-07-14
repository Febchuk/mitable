import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";
import {
  filterStudentIdsByUiHidden,
  loadUiHiddenSets,
  revealHiddenFromRequest,
  shouldFilterUiHidden,
} from "@/lib/visibility/ui-hidden";

/**
 * Admin roster for the Speech tab: active students plus count of speech targets.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const filterHidden = shouldFilterUiHidden(auth.user.role, revealHiddenFromRequest(req));
  const hidden = filterHidden
    ? await loadUiHiddenSets(supabase, auth.user.schoolId)
    : { classroomIds: new Set<string>(), teacherIds: new Set<string>() };

  const { data: students, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name")
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null)
    .order("first_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allIds = (students ?? []).map((s) => s.id as string);
  const visibleIds = await filterStudentIdsByUiHidden(
    supabase,
    allIds,
    hidden.classroomIds,
    filterHidden
  );
  const visibleStudents = (students ?? []).filter((s) => visibleIds.has(s.id as string));

  const ids = visibleStudents.map((s) => s.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from("speech_targets")
      .select("student_id")
      .in("student_id", ids)
      .is("archived_at", null);
    for (const row of rows ?? []) {
      const sid = row.student_id as string;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    students: visibleStudents.map((s) => ({
      id: s.id as string,
      firstName: s.first_name as string,
      lastName: s.last_name as string,
      preferredName: (s.preferred_name as string | null) ?? null,
      targetCount: counts.get(s.id as string) ?? 0,
    })),
  });
}
