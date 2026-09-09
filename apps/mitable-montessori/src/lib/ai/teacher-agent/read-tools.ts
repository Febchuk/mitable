import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-tool executors for the teacher agent. These run server-side during a
 * turn. The caller (turn route) has already verified `classroomId` is the
 * signed-in teacher's active classroom and `schoolId` is their school, so every
 * query here is explicitly scoped to those and uses the admin client to avoid
 * the reports RLS recursion (same approach as the report routes).
 */

export interface RosterEntry {
  id: string;
  name: string;
}

export async function fetchRoster(
  admin: SupabaseClient,
  classroomId: string
): Promise<RosterEntry[]> {
  const { data } = await admin
    .from("student_classroom_enrollments")
    .select("students!inner(id, first_name, preferred_name, last_name, archived_at)")
    .eq("classroom_id", classroomId)
    .is("end_date", null);

  const roster: RosterEntry[] = [];
  for (const row of data ?? []) {
    const joined = (row as { students: unknown }).students;
    const student = Array.isArray(joined) ? joined[0] : joined;
    if (!student) continue;
    const s = student as {
      id: string;
      first_name: string | null;
      preferred_name: string | null;
      last_name: string | null;
      archived_at: string | null;
    };
    if (s.archived_at) continue;
    const first = (s.preferred_name || s.first_name || "").trim();
    const name = `${first} ${s.last_name ?? ""}`.trim() || "Unnamed student";
    roster.push({ id: s.id, name });
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));
  return roster;
}

export async function listCurriculum(
  admin: SupabaseClient,
  classroomId: string
): Promise<
  Array<{ topic: string; markingSchema: string; subtopics: Array<{ id: string; name: string }> }>
> {
  const { data: room } = await admin
    .from("classrooms")
    .select("curriculum_id")
    .eq("id", classroomId)
    .maybeSingle();
  const curriculumId = (room as { curriculum_id: string | null } | null)?.curriculum_id;
  if (!curriculumId) return [];

  // Return the whole tree (topics + their subtopics) so the model can match the
  // teacher's wording against every option itself, rather than a lossy ilike.
  const { data } = await admin
    .from("curriculum_topics")
    .select(
      "id, name, marking_schema, sort_order, is_active, curriculum_subtopics(id, name, sort_order, is_active)"
    )
    .eq("curriculum_id", curriculumId)
    .eq("is_active", true)
    .order("sort_order");

  return (data ?? []).map((t) => {
    const row = t as {
      name: string;
      marking_schema: string;
      curriculum_subtopics: Array<{
        id: string;
        name: string;
        sort_order: number | null;
        is_active: boolean;
      }> | null;
    };
    const subtopics = (row.curriculum_subtopics ?? [])
      .filter((s) => s.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s) => ({ id: s.id, name: s.name }));
    return { topic: row.name, markingSchema: row.marking_schema ?? "ipm", subtopics };
  });
}

export async function listStudentReports(
  admin: SupabaseClient,
  schoolId: string,
  studentId: string
): Promise<Array<{ reportId: string; title: string; type: string; status: string; date: string }>> {
  const { data } = await admin
    .from("reports")
    .select("id, title, report_type, status, report_date, students!inner(school_id)")
    .eq("student_id", studentId)
    .eq("students.school_id", schoolId)
    .order("report_date", { ascending: false })
    .limit(20);

  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      title: string | null;
      report_type: string;
      status: string;
      report_date: string;
    };
    return {
      reportId: row.id,
      title: row.title ?? "Untitled",
      type: row.report_type,
      status: row.status,
      date: row.report_date,
    };
  });
}

interface StoredSection {
  id: string;
  heading: string;
  paragraphs: Array<{ id: string; html: string }>;
}

export async function getReportDetail(
  admin: SupabaseClient,
  schoolId: string,
  reportId: string
): Promise<{
  reportId: string;
  title: string;
  status: string;
  sections: Array<{ heading: string; text: string }>;
} | null> {
  const { data } = await admin
    .from("reports")
    .select("id, title, status, sections, students!inner(school_id)")
    .eq("id", reportId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string | null;
    status: string;
    sections: StoredSection[] | null;
    students: { school_id: string } | null;
  };
  if (row.students?.school_id !== schoolId) return null;

  const sections = (row.sections ?? []).map((s) => ({
    heading: s.heading,
    text: (s.paragraphs ?? [])
      .map((p) => htmlToText(p.html))
      .join("\n\n")
      .trim(),
  }));
  return { reportId: row.id, title: row.title ?? "Untitled", status: row.status, sections };
}

/**
 * Context for elementary exam grades: the school's terms (with which one covers
 * today) and the subject/assessment pairs already recorded in this classroom, so
 * the model reuses existing spellings and the current term rather than inventing.
 */
export async function listGradeContext(
  admin: SupabaseClient,
  schoolId: string,
  classroomId: string
): Promise<{
  terms: Array<{
    termId: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
  }>;
  existingAssessments: Array<{ subject: string; assessmentName: string }>;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: termRows }, { data: gradeRows }] = await Promise.all([
    admin
      .from("school_terms")
      .select("id, name, start_date, end_date")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false }),
    admin
      .from("elementary_exam_grades")
      .select("subject, assessment_name")
      .eq("classroom_id", classroomId)
      .eq("school_id", schoolId),
  ]);

  const terms = (termRows ?? []).map((t) => {
    const row = t as { id: string; name: string; start_date: string; end_date: string };
    return {
      termId: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isCurrent: row.start_date <= today && today <= row.end_date,
    };
  });

  const seen = new Set<string>();
  const existingAssessments: Array<{ subject: string; assessmentName: string }> = [];
  for (const g of gradeRows ?? []) {
    const row = g as { subject: string; assessment_name: string };
    const key = `${row.subject}\u0000${row.assessment_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    existingAssessments.push({ subject: row.subject, assessmentName: row.assessment_name });
  }

  return { terms, existingAssessments };
}

/** Minimal, dependency-free HTML → text for surfacing existing section content. */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
