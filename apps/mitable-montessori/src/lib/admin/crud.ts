import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin CRUD primitives. Pure functions over a Supabase client + the actor's
 * school_id / user_id. Reused by:
 *   - REST route handlers under /api/admin/*
 *   - The admin agent's reference tools (Phase 4 Week 11)
 *
 * Every write returns the row id. Soft deletes use `archived_at` /
 * `status='archived'`; nothing here issues a DELETE.
 */

export interface AdminContext {
  supabase: SupabaseClient;
  schoolId: string;
  actorUserId: string;
}

export class AdminError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "conflict" | "db_error" | "invalid"
  ) {
    super(message);
  }
}

async function insertReturningId(
  ctx: AdminContext,
  table: string,
  row: Record<string, unknown>
): Promise<string> {
  const { data, error } = await ctx.supabase.from(table).insert(row).select("id").single();
  if (error || !data) throw new AdminError(error?.message ?? `Insert failed`, "db_error");
  return (data as { id: string }).id;
}

// === Users ===
export async function createUser(
  ctx: AdminContext,
  input: {
    role: "admin" | "teacher";
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  }
) {
  return insertReturningId(ctx, "users", {
    school_id: ctx.schoolId,
    role: input.role,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone ?? null,
    status: "active",
  });
}

// === Students ===
export async function createStudent(
  ctx: AdminContext,
  input: {
    first_name: string;
    last_name: string;
    preferred_name?: string;
    birth_date?: string;
    nicknames?: string[];
    notes?: string;
  }
) {
  return insertReturningId(ctx, "students", {
    school_id: ctx.schoolId,
    first_name: input.first_name,
    last_name: input.last_name,
    preferred_name: input.preferred_name ?? null,
    birth_date: input.birth_date ?? null,
    nicknames: input.nicknames ?? [],
    notes: input.notes ?? null,
  });
}

export async function updateStudent(
  ctx: AdminContext,
  studentId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const { error } = await ctx.supabase
    .from("students")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", studentId)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
}

export async function archiveStudent(
  ctx: AdminContext,
  studentId: string,
  _reason: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("students")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", studentId)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
}

// === Guardians ===
export async function createGuardian(
  ctx: AdminContext,
  input: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    preferred_contact_method?: "email" | "phone" | "either";
  }
) {
  return insertReturningId(ctx, "guardians", {
    school_id: ctx.schoolId,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    preferred_contact_method: input.preferred_contact_method ?? "either",
  });
}

export async function linkGuardianToStudent(
  ctx: AdminContext,
  input: {
    student_id: string;
    guardian_id: string;
    relationship?: "mother" | "father" | "guardian" | "other";
    is_primary_contact?: boolean;
    receives_reports?: boolean;
  }
) {
  return insertReturningId(ctx, "student_guardians", {
    student_id: input.student_id,
    guardian_id: input.guardian_id,
    relationship: input.relationship ?? "guardian",
    is_primary_contact: input.is_primary_contact ?? false,
    receives_reports: input.receives_reports ?? true,
  });
}

export async function unlinkGuardianFromStudent(
  ctx: AdminContext,
  studentId: string,
  guardianId: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("student_guardians")
    .delete()
    .eq("student_id", studentId)
    .eq("guardian_id", guardianId);
  if (error) throw new AdminError(error.message, "db_error");
}

// === Classrooms + assignments ===
export async function createClassroom(
  ctx: AdminContext,
  input: { name: string; code?: string; curriculum_id?: string }
) {
  return insertReturningId(ctx, "classrooms", {
    school_id: ctx.schoolId,
    name: input.name,
    code: input.code ?? null,
    curriculum_id: input.curriculum_id ?? null,
    status: "active",
  });
}

export async function assignTeacherToClassroom(
  ctx: AdminContext,
  input: {
    teacher_user_id: string;
    classroom_id: string;
    classroom_role?: "lead" | "support" | "assistant";
    start_date: string;
  }
) {
  return insertReturningId(ctx, "classroom_teacher_assignments", {
    teacher_user_id: input.teacher_user_id,
    classroom_id: input.classroom_id,
    classroom_role: input.classroom_role ?? "support",
    start_date: input.start_date,
    end_date: null,
  });
}

export async function unassignTeacherFromClassroom(
  ctx: AdminContext,
  assignmentId: string,
  endDate: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("classroom_teacher_assignments")
    .update({ end_date: endDate })
    .eq("id", assignmentId);
  if (error) throw new AdminError(error.message, "db_error");
}

export async function transferStudent(
  ctx: AdminContext,
  input: { student_id: string; new_classroom_id: string; start_date: string }
) {
  // End the current active enrollment.
  const { error: endErr } = await ctx.supabase
    .from("student_classroom_enrollments")
    .update({ end_date: input.start_date })
    .eq("student_id", input.student_id)
    .is("end_date", null);
  if (endErr) throw new AdminError(endErr.message, "db_error");

  return insertReturningId(ctx, "student_classroom_enrollments", {
    student_id: input.student_id,
    classroom_id: input.new_classroom_id,
    start_date: input.start_date,
    end_date: null,
    is_primary: true,
  });
}

export async function assignCurriculumToClassroom(
  ctx: AdminContext,
  classroomId: string,
  curriculumId: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("classrooms")
    .update({ curriculum_id: curriculumId, updated_at: new Date().toISOString() })
    .eq("id", classroomId)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
}

// === Curriculum ===
export async function createCurriculum(
  ctx: AdminContext,
  input: { name: string; framework?: string; description?: string }
) {
  return insertReturningId(ctx, "curricula", {
    school_id: ctx.schoolId,
    name: input.name,
    framework: input.framework ?? "montessori",
    is_active: true,
    created_by_user_id: ctx.actorUserId,
  });
}

export async function createCurriculumSubject(
  ctx: AdminContext,
  input: { curriculum_id: string; name: string; sort_order: number }
) {
  return insertReturningId(ctx, "curriculum_subjects", {
    curriculum_id: input.curriculum_id,
    name: input.name,
    sort_order: input.sort_order,
    is_active: true,
  });
}

export async function createCurriculumTopic(
  ctx: AdminContext,
  input: { curriculum_id: string; subject_id: string; name: string; sort_order: number }
) {
  return insertReturningId(ctx, "curriculum_topics", {
    curriculum_id: input.curriculum_id,
    subject_id: input.subject_id,
    name: input.name,
    sort_order: input.sort_order,
    is_active: true,
  });
}

export async function createCurriculumSubtopic(
  ctx: AdminContext,
  input: { topic_id: string; name: string; sort_order: number; aliases?: string[] }
) {
  return insertReturningId(ctx, "curriculum_subtopics", {
    topic_id: input.topic_id,
    name: input.name,
    sort_order: input.sort_order,
    is_active: true,
    aliases: input.aliases ?? [],
  });
}

export async function renameSubtopic(
  ctx: AdminContext,
  subtopicId: string,
  newName: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("curriculum_subtopics")
    .update({ name: newName })
    .eq("id", subtopicId);
  if (error) throw new AdminError(error.message, "db_error");
}

export async function archiveSubtopic(ctx: AdminContext, subtopicId: string): Promise<void> {
  const { error } = await ctx.supabase
    .from("curriculum_subtopics")
    .update({ is_active: false })
    .eq("id", subtopicId);
  if (error) throw new AdminError(error.message, "db_error");
}

export async function renameTopic(
  ctx: AdminContext,
  topicId: string,
  newName: string
): Promise<void> {
  const { error } = await ctx.supabase
    .from("curriculum_topics")
    .update({ name: newName })
    .eq("id", topicId);
  if (error) throw new AdminError(error.message, "db_error");
}
