import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import type { CurriculumStatus } from "@/lib/queries/curriculum";
import type { ProgressProgram } from "@/lib/queries/progress-programs";

export type { ProgressProgram };

export type ClassroomProgressSubject = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ClassroomProgressTopic = {
  id: string;
  name: string;
  subjectId: string;
  sortOrder: number;
};

export type ClassroomProgressSubtopic = {
  id: string;
  name: string;
  topicId: string;
  sortOrder: number;
};

export type ClassroomProgressStudent = {
  id: string;
  fullName: string;
  preferredName: string | null;
  /** True for now (TODO: join attendance_days). Mirrors mock CHILDREN.present. */
  present: boolean;
};

export type ClassroomProgress = {
  classroomId: string;
  classroomName: string;
  /** False when the active classroom has classrooms.curriculum_id IS NULL. */
  curriculumAssigned: boolean;
  /** Programs this classroom supports. Drives which mode(s) the Progress
   *  route exposes. Defaults to ["montessori"] when not declared on the
   *  classroom row. */
  programs: ProgressProgram[];
  subjects: ClassroomProgressSubject[];
  topics: ClassroomProgressTopic[];
  subtopics: ClassroomProgressSubtopic[];
  students: ClassroomProgressStudent[];
  /** progress[studentId][subtopicId] = CurriculumStatus */
  progress: Record<string, Record<string, CurriculumStatus>>;
};

type SubjectDbRow = {
  id: string;
  name: string;
  sort_order: number;
  curriculum_topics: Array<{
    id: string;
    name: string;
    sort_order: number;
    curriculum_subtopics: Array<{
      id: string;
      name: string;
      sort_order: number;
    }>;
  }>;
};

type StudentDbRow = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  student_classroom_enrollments: Array<{
    classroom_id: string;
    end_date: string | null;
  }>;
};

type ProgressDbRow = {
  student_id: string;
  curriculum_subtopic_id: string;
  status: CurriculumStatus;
};

/**
 * Returns everything the Progress tab needs in one server-side pass:
 * the active classroom's roster, its curriculum tree (subjects → topics →
 * subtopics), and a per-student per-subtopic progress map.
 *
 * Returns null when the caller has no active classroom assignment.
 * Returns curriculumAssigned=false (with empty subject/topic/subtopic arrays
 * but a populated roster) when the classroom has no curriculum_id.
 */
export async function getClassroomProgress(): Promise<ClassroomProgress | null> {
  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) return null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Look up the classroom's curriculum_id + programs. RLS allows any school
  // member to read.
  const classroomResp = await supabase
    .from("classrooms")
    .select("curriculum_id, program_types")
    .eq("id", classroom.id)
    .maybeSingle();
  const curriculumId = (classroomResp.data?.curriculum_id as string | null) ?? null;
  const rawPrograms = (classroomResp.data as { program_types?: string[] | null } | null)
    ?.program_types;
  const programs: ProgressProgram[] =
    Array.isArray(rawPrograms) && rawPrograms.length > 0
      ? rawPrograms.filter((p): p is ProgressProgram =>
          (["montessori", "iep", "session_notes"] as const).includes(p as ProgressProgram)
        )
      : ["montessori"];

  // Always fetch the roster — even when curriculum is unassigned, we want to
  // render an empty-state UI with the right children visible.
  const studentsResp = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, preferred_name, " +
        "student_classroom_enrollments(classroom_id, end_date)"
    )
    .is("archived_at", null)
    .returns<StudentDbRow[]>();

  const students: ClassroomProgressStudent[] = (studentsResp.data ?? [])
    .filter((s) =>
      s.student_classroom_enrollments.some(
        (e) => e.end_date === null && e.classroom_id === classroom.id
      )
    )
    .map((s) => ({
      id: s.id,
      fullName: `${s.first_name} ${s.last_name}`.trim(),
      preferredName: s.preferred_name,
      present: true,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  if (!curriculumId) {
    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      curriculumAssigned: false,
      programs,
      subjects: [],
      topics: [],
      subtopics: [],
      students,
      progress: {},
    };
  }

  // Pull the full subject → topic → subtopic tree for this curriculum, ordered
  // by sort_order at every level. Inactive rows are filtered post-fetch so the
  // nested-select stays a single round-trip.
  const treeResp = await supabase
    .from("curriculum_subjects")
    .select(
      "id, name, sort_order, " +
        "curriculum_topics(id, name, sort_order, " +
        "curriculum_subtopics(id, name, sort_order))"
    )
    .eq("curriculum_id", curriculumId)
    .returns<SubjectDbRow[]>();

  const subjects: ClassroomProgressSubject[] = [];
  const topics: ClassroomProgressTopic[] = [];
  const subtopics: ClassroomProgressSubtopic[] = [];

  for (const subj of treeResp.data ?? []) {
    subjects.push({ id: subj.id, name: subj.name, sortOrder: subj.sort_order });
    for (const t of subj.curriculum_topics) {
      topics.push({
        id: t.id,
        name: t.name,
        subjectId: subj.id,
        sortOrder: t.sort_order,
      });
      for (const st of t.curriculum_subtopics) {
        subtopics.push({
          id: st.id,
          name: st.name,
          topicId: t.id,
          sortOrder: st.sort_order,
        });
      }
    }
  }
  subjects.sort((a, b) => a.sortOrder - b.sortOrder);
  topics.sort((a, b) => a.sortOrder - b.sortOrder);
  subtopics.sort((a, b) => a.sortOrder - b.sortOrder);

  // Pull progress for every student in the roster in one query. RLS already
  // confines the select to the school's students; the .in() narrows further
  // and keeps the payload small.
  const progress: Record<string, Record<string, CurriculumStatus>> = {};
  if (students.length > 0) {
    const progressResp = await supabase
      .from("student_progress")
      .select("student_id, curriculum_subtopic_id, status")
      .in(
        "student_id",
        students.map((s) => s.id)
      )
      .returns<ProgressDbRow[]>();

    for (const row of progressResp.data ?? []) {
      const byStudent = progress[row.student_id] ?? (progress[row.student_id] = {});
      byStudent[row.curriculum_subtopic_id] = row.status;
    }
  }

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    curriculumAssigned: true,
    programs,
    subjects,
    topics,
    subtopics,
    students,
    progress,
  };
}
