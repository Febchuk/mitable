import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminTokenizer } from "@/lib/admin/tokenizer";

/**
 * Read tools for the admin agent. Every result is tokenized — the agent never
 * sees real names. The tokenizer is shared with the surrounding agent loop so
 * tokens stay consistent across multiple read-tool calls in one session.
 */

export interface ReadToolContext {
  supabase: SupabaseClient;
  schoolId: string;
  tokenizer: AdminTokenizer;
}

export async function listStudentsInClassroom(ctx: ReadToolContext, classroomRef: string) {
  const { data } = await ctx.supabase
    .from("student_classroom_enrollments")
    .select("student_id, students(id, first_name, last_name, archived_at)")
    .eq("classroom_id", classroomRef)
    .is("end_date", null);
  const out: Array<{ student_token: string }> = [];
  for (const row of data ?? []) {
    const r = row as unknown as {
      students:
        | { id: string; first_name: string; last_name: string; archived_at: string | null }
        | { id: string; first_name: string; last_name: string; archived_at: string | null }[]
        | null;
    };
    const student = Array.isArray(r.students) ? r.students[0] : r.students;
    if (!student || student.archived_at) continue;
    const display = `${student.first_name} ${student.last_name}`;
    const tok = ctx.tokenizer.token("student", student.id, display);
    out.push({ student_token: tok });
  }
  return out;
}

export async function listClassrooms(ctx: ReadToolContext) {
  const { data } = await ctx.supabase
    .from("classrooms")
    .select("id, name, code, curriculum_id")
    .eq("school_id", ctx.schoolId)
    .eq("status", "active");
  return (data ?? []).map((c) => {
    const row = c as {
      id: string;
      name: string;
      code: string | null;
      curriculum_id: string | null;
    };
    return {
      classroom_token: ctx.tokenizer.token("classroom", row.id, row.name),
      code: row.code,
      curriculum_token: row.curriculum_id
        ? ctx.tokenizer.token("curriculum", row.curriculum_id, "")
        : null,
    };
  });
}

export async function listCurricula(ctx: ReadToolContext) {
  const { data } = await ctx.supabase
    .from("curricula")
    .select("id, name, framework, is_active")
    .eq("school_id", ctx.schoolId)
    .eq("is_active", true);
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; framework: string };
    return {
      curriculum_token: ctx.tokenizer.token("curriculum", row.id, row.name),
      framework: row.framework,
    };
  });
}

export async function listTopics(ctx: ReadToolContext, curriculumRef: string) {
  const { data } = await ctx.supabase
    .from("curriculum_topics")
    .select("id, name, sort_order, is_active")
    .eq("curriculum_id", curriculumRef)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; sort_order: number };
    return {
      topic_token: ctx.tokenizer.token("topic", row.id, row.name),
      sort_order: row.sort_order,
    };
  });
}

export async function listSubtopics(ctx: ReadToolContext, topicRef: string) {
  const { data } = await ctx.supabase
    .from("curriculum_subtopics")
    .select("id, name, sort_order, is_active")
    .eq("topic_id", topicRef)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; sort_order: number };
    return {
      subtopic_token: ctx.tokenizer.token("subtopic", row.id, row.name),
      sort_order: row.sort_order,
    };
  });
}

export async function findSubtopicByName(
  ctx: ReadToolContext,
  curriculumRef: string,
  search: string
) {
  // ilike against name + the aliases array.
  const { data } = await ctx.supabase
    .from("curriculum_subtopics")
    .select("id, name, topic_id, curriculum_topics!inner(curriculum_id)")
    .eq("curriculum_topics.curriculum_id", curriculumRef)
    .ilike("name", `%${search}%`)
    .limit(10);
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string };
    return { subtopic_token: ctx.tokenizer.token("subtopic", row.id, row.name) };
  });
}

export async function findGuardianByName(ctx: ReadToolContext, search: string) {
  const { data } = await ctx.supabase
    .from("guardians")
    .select("id, first_name, last_name")
    .eq("school_id", ctx.schoolId)
    .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
    .limit(10);
  return (data ?? []).map((r) => {
    const row = r as { id: string; first_name: string; last_name: string };
    const display = `${row.first_name} ${row.last_name}`;
    return { guardian_token: ctx.tokenizer.token("guardian", row.id, display) };
  });
}
