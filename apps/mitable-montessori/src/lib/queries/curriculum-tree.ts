import type { SupabaseClient } from "@supabase/supabase-js";

export type CurriculumListItem = {
  id: string;
  name: string;
  framework: string;
  isActive: boolean;
};

export type CurriculumTreeSubtopic = { id: string; name: string; sortOrder: number };
export type CurriculumTreeTopic = {
  id: string;
  name: string;
  sortOrder: number;
  subtopics: CurriculumTreeSubtopic[];
};
export type CurriculumTreeSubject = {
  id: string;
  name: string;
  sortOrder: number;
  topics: CurriculumTreeTopic[];
};

export type CurriculumTree = CurriculumListItem & {
  subjects: CurriculumTreeSubject[];
};

type SubjectDbRow = {
  id: string;
  name: string;
  sort_order: number;
  curriculum_topics: Array<{
    id: string;
    name: string;
    sort_order: number;
    curriculum_subtopics: Array<{ id: string; name: string; sort_order: number }>;
  }>;
};

/** Canonical program/framework token stored in `curricula.framework`. */
export function normalizeCurriculumFramework(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : "montessori";
}

function curriculumIdFromAssignmentRow(row: {
  classrooms: { curriculum_id: string | null } | { curriculum_id: string | null }[] | null;
}): string | null {
  const room = row.classrooms;
  if (!room) return null;
  if (Array.isArray(room)) return room[0]?.curriculum_id ?? null;
  return room.curriculum_id;
}

export async function listSchoolCurricula(
  supabase: SupabaseClient,
  schoolId: string
): Promise<CurriculumListItem[]> {
  const { data, error } = await supabase
    .from("curricula")
    .select("id, name, framework, is_active")
    .eq("school_id", schoolId)
    .order("name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    framework: normalizeCurriculumFramework(row.framework as string),
    isActive: row.is_active as boolean,
  }));
}

/** Curricula linked to classrooms the teacher is actively assigned to. */
export async function listTeacherClassroomCurricula(
  supabase: SupabaseClient,
  teacherUserId: string
): Promise<CurriculumListItem[]> {
  const { data: assignments, error: aErr } = await supabase
    .from("classroom_teacher_assignments")
    .select("classrooms!inner(curriculum_id)")
    .eq("teacher_user_id", teacherUserId)
    .is("end_date", null);

  if (aErr) throw new Error(aErr.message);

  const curriculumIds = [
    ...new Set(
      (assignments ?? [])
        .map((row) => curriculumIdFromAssignmentRow(row))
        .filter((id): id is string => !!id)
    ),
  ];

  if (curriculumIds.length === 0) return [];

  const { data, error } = await supabase
    .from("curricula")
    .select("id, name, framework, is_active")
    .in("id", curriculumIds)
    .order("name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    framework: normalizeCurriculumFramework(row.framework as string),
    isActive: row.is_active as boolean,
  }));
}

export async function teacherCanAccessCurriculum(
  supabase: SupabaseClient,
  teacherUserId: string,
  curriculumId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("classroom_teacher_assignments")
    .select("classrooms!inner(curriculum_id)")
    .eq("teacher_user_id", teacherUserId)
    .is("end_date", null);

  if (error) throw new Error(error.message);

  return (data ?? []).some((row) => curriculumIdFromAssignmentRow(row) === curriculumId);
}

export async function getCurriculumTree(
  supabase: SupabaseClient,
  args: { curriculumId: string; schoolId: string }
): Promise<CurriculumTree | null> {
  const { data: row, error: headErr } = await supabase
    .from("curricula")
    .select("id, name, framework, is_active, school_id")
    .eq("id", args.curriculumId)
    .maybeSingle();

  if (headErr) throw new Error(headErr.message);
  if (!row || (row.school_id as string) !== args.schoolId) return null;

  const { data: subjectRows, error: treeErr } = await supabase
    .from("curriculum_subjects")
    .select(
      "id, name, sort_order, curriculum_topics(id, name, sort_order, curriculum_subtopics(id, name, sort_order))"
    )
    .eq("curriculum_id", args.curriculumId)
    .returns<SubjectDbRow[]>();

  if (treeErr) throw new Error(treeErr.message);

  const subjects: CurriculumTreeSubject[] = (subjectRows ?? [])
    .map((subj) => ({
      id: subj.id,
      name: subj.name,
      sortOrder: subj.sort_order,
      topics: [...(subj.curriculum_topics ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((topic) => ({
          id: topic.id,
          name: topic.name,
          sortOrder: topic.sort_order,
          subtopics: [...(topic.curriculum_subtopics ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((st) => ({
              id: st.id,
              name: st.name,
              sortOrder: st.sort_order,
            })),
        })),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: row.id as string,
    name: row.name as string,
    framework: normalizeCurriculumFramework(row.framework as string),
    isActive: row.is_active as boolean,
    subjects,
  };
}
