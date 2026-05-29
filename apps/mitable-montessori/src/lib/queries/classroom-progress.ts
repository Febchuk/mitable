import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import type { ProgressMark, RecentUpdateEntry } from "@/components/montessori/data";
import type { CurriculumStatus } from "@/lib/queries/curriculum";
import type { ProgressProgram } from "@/lib/queries/progress-programs";
import { normalizeGroupColor, type ClassroomGroup } from "@/lib/classroom-groups";

export type { ProgressProgram };
export type { ClassroomGroup };

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
  /** Active (non-archived) IEP goal rows for this child. 0 when classroom has no IEP program. */
  iepItemCount: number;
  /** Active (non-archived) speech target rows for this child. 0 when classroom has no Speech program. */
  speechTargetCount: number;
  /** The classroom group ("team") this child belongs to, or null when ungrouped. */
  groupId: string | null;
};

export type ClassroomProgress = {
  classroomId: string;
  classroomName: string;
  /** False when the active classroom has classrooms.curriculum_id IS NULL. */
  curriculumAssigned: boolean;
  /** Name of the assigned curriculum row, when `curriculumAssigned`. */
  curriculumName: string | null;
  /** Programs this classroom supports. Drives which mode(s) the Progress
   *  route exposes. Defaults to ["montessori"] when not declared on the
   *  classroom row. */
  programs: ProgressProgram[];
  /** Admin-defined groups ("teams") for this classroom, ordered. Empty when none. */
  groups: ClassroomGroup[];
  subjects: ClassroomProgressSubject[];
  topics: ClassroomProgressTopic[];
  subtopics: ClassroomProgressSubtopic[];
  students: ClassroomProgressStudent[];
  /** progress[studentId][subtopicId] = CurriculumStatus */
  progress: Record<string, Record<string, CurriculumStatus>>;
  /** Recent classroom progress events for the right-hand updates rail. */
  recentUpdates: RecentUpdateEntry[];
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

type ProgressHistoryDbRow = {
  id: string;
  student_id: string;
  curriculum_subtopic_id: string;
  new_status: string | null;
  comment: string | null;
  changed_at: string;
};

function dbStatusToMark(status: string | null | undefined): ProgressMark {
  if (status === "mastered") return "m";
  if (status === "practicing") return "p";
  if (status === "introduced") return "i";
  return "-";
}

function formatProgressWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffM = Math.floor(diffMs / 60_000);
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Internal carrier so progress changes and free-form comments can be merged
 *  into one feed in true timestamp order before the `when` string is built. */
type TimedEntry = { ts: number; entry: RecentUpdateEntry };

function tsOf(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

async function listRecentProgressUpdates(
  supabase: ReturnType<typeof createClient>,
  studentIds: string[],
  subtopics: ClassroomProgressSubtopic[],
  topics: ClassroomProgressTopic[]
): Promise<TimedEntry[]> {
  if (studentIds.length === 0 || subtopics.length === 0) return [];

  const subtopicById = new Map(subtopics.map((s) => [s.id, s] as const));
  const topicById = new Map(topics.map((t) => [t.id, t] as const));

  const { data, error } = await supabase
    .from("student_progress_history")
    .select("id, student_id, curriculum_subtopic_id, new_status, comment, changed_at")
    .in("student_id", studentIds)
    .in(
      "curriculum_subtopic_id",
      subtopics.map((s) => s.id)
    )
    .order("changed_at", { ascending: false })
    .limit(60)
    .returns<ProgressHistoryDbRow[]>();

  if (error || !data) return [];

  const out: TimedEntry[] = [];
  for (const row of data) {
    const sub = subtopicById.get(row.curriculum_subtopic_id);
    if (!sub) continue;
    const topic = topicById.get(sub.topicId);
    if (!topic) continue;
    const noteText = row.comment?.trim() || null;
    if (!noteText && !row.new_status) continue;
    out.push({
      ts: tsOf(row.changed_at),
      entry: {
        id: row.id,
        kind: "progress",
        topic: topic.name,
        subtopicName: sub.name,
        childId: row.student_id,
        subtopicId: sub.id,
        status: dbStatusToMark(row.new_status),
        noteText,
        when: formatProgressWhen(row.changed_at),
      },
    });
  }
  return out;
}

type StudentCommentDbRow = {
  id: string;
  student_id: string;
  comment: string;
  created_at: string;
};

async function listRecentComments(
  supabase: ReturnType<typeof createClient>,
  studentIds: string[]
): Promise<TimedEntry[]> {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("student_comments")
    .select("id, student_id, comment, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<StudentCommentDbRow[]>();

  if (error || !data) return [];

  const out: TimedEntry[] = [];
  for (const row of data) {
    const noteText = row.comment?.trim();
    if (!noteText) continue;
    out.push({
      ts: tsOf(row.created_at),
      entry: {
        id: row.id,
        kind: "comment",
        topic: "",
        subtopicName: "",
        childId: row.student_id,
        subtopicId: "",
        status: "-",
        noteText,
        when: formatProgressWhen(row.created_at),
      },
    });
  }
  return out;
}

async function iepItemCountByStudent(
  supabase: ReturnType<typeof createClient>,
  studentIds: string[]
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from("iep_items")
    .select("student_id")
    .in("student_id", studentIds)
    .is("archived_at", null);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const row of data) {
    const sid = row.student_id as string;
    out[sid] = (out[sid] ?? 0) + 1;
  }
  return out;
}

async function speechTargetCountByStudent(
  supabase: ReturnType<typeof createClient>,
  studentIds: string[]
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from("speech_targets")
    .select("student_id")
    .in("student_id", studentIds)
    .is("archived_at", null);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const row of data) {
    const sid = row.student_id as string;
    out[sid] = (out[sid] ?? 0) + 1;
  }
  return out;
}

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
          (["montessori", "iep", "speech"] as const).includes(p as ProgressProgram)
        )
      : ["montessori"];

  let curriculumName: string | null = null;
  if (curriculumId) {
    const { data: curRow } = await supabase
      .from("curricula")
      .select("name")
      .eq("id", curriculumId)
      .maybeSingle();
    curriculumName = (curRow?.name as string | null) ?? null;
  }

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

  const studentsBase = (studentsResp.data ?? [])
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

  // Classroom groups ("teams") + per-child membership for this classroom.
  const { data: groupRows } = await supabase
    .from("classroom_groups")
    .select("id, name, color, sort_order")
    .eq("classroom_id", classroom.id)
    .order("sort_order");
  const groups: ClassroomGroup[] = (groupRows ?? []).map((g) => {
    const row = g as { id: string; name: string; color: string | null; sort_order: number | null };
    return {
      id: row.id,
      name: row.name,
      color: normalizeGroupColor(row.color),
      sortOrder: row.sort_order ?? 0,
    };
  });

  const groupIdByStudent = new Map<string, string>();
  if (groups.length > 0 && studentsBase.length > 0) {
    const { data: memberRows } = await supabase
      .from("classroom_group_members")
      .select("student_id, group_id")
      .eq("classroom_id", classroom.id);
    for (const m of memberRows ?? []) {
      const row = m as { student_id: string; group_id: string };
      groupIdByStudent.set(row.student_id, row.group_id);
    }
  }

  const iepCounts =
    programs.includes("iep") && studentsBase.length > 0
      ? await iepItemCountByStudent(
          supabase,
          studentsBase.map((s) => s.id)
        )
      : null;

  const speechCounts =
    programs.includes("speech") && studentsBase.length > 0
      ? await speechTargetCountByStudent(
          supabase,
          studentsBase.map((s) => s.id)
        )
      : null;

  const students: ClassroomProgressStudent[] = studentsBase.map((s) => ({
    ...s,
    iepItemCount: iepCounts ? (iepCounts[s.id] ?? 0) : 0,
    speechTargetCount: speechCounts ? (speechCounts[s.id] ?? 0) : 0,
    groupId: groupIdByStudent.get(s.id) ?? null,
  }));

  if (!curriculumId) {
    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      curriculumAssigned: false,
      curriculumName: null,
      programs,
      groups,
      subjects: [],
      topics: [],
      subtopics: [],
      students,
      progress: {},
      recentUpdates: [],
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

  const studentIds = students.map((s) => s.id);
  const [progressTimed, commentTimed] = await Promise.all([
    listRecentProgressUpdates(supabase, studentIds, subtopics, topics),
    listRecentComments(supabase, studentIds),
  ]);
  // Interleave progress changes and free-form comments by real timestamp, then
  // drop down to the feed cap.
  const recentUpdates = [...progressTimed, ...commentTimed]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60)
    .map((t) => t.entry);

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    curriculumAssigned: true,
    curriculumName,
    programs,
    groups,
    subjects,
    topics,
    subtopics,
    students,
    progress,
    recentUpdates,
  };
}
