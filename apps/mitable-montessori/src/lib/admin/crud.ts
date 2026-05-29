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
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    preferred_contact_method?: "email" | "phone" | "either";
  }
) {
  const email = input.email?.trim() || undefined;
  let first = (input.first_name ?? "").trim();
  let last = (input.last_name ?? "").trim();
  if (email && (!first || !last)) {
    const local =
      email
        .split("@")[0]!
        .replace(/\+[^@]*$/, "")
        .replace(/[._]+/g, " ")
        .trim() || "Guardian";
    if (!first) first = local.slice(0, 100);
    if (!last) last = "Family";
  }
  if (!first || !last) {
    throw new AdminError("Guardian needs a valid email or both first and last name", "invalid");
  }
  return insertReturningId(ctx, "guardians", {
    school_id: ctx.schoolId,
    first_name: first,
    last_name: last,
    email: email ?? null,
    phone: input.phone?.trim() || null,
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
  input: {
    name: string;
    code?: string;
    curriculum_id?: string;
    program_types?: Array<"montessori" | "iep" | "speech">;
  }
) {
  return insertReturningId(ctx, "classrooms", {
    school_id: ctx.schoolId,
    name: input.name,
    code: input.code ?? null,
    curriculum_id: input.curriculum_id ?? null,
    status: "active",
    // The DB has a default of ['montessori']; only send the column when the
    // caller explicitly chose programs so the default still applies on omit.
    ...(input.program_types && input.program_types.length > 0
      ? { program_types: input.program_types }
      : {}),
  });
}

export async function updateClassroomPrograms(
  ctx: AdminContext,
  input: {
    classroom_id: string;
    program_types: Array<"montessori" | "iep" | "speech">;
  }
): Promise<void> {
  const { error } = await ctx.supabase
    .from("classrooms")
    .update({ program_types: input.program_types })
    .eq("id", input.classroom_id)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
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
  const { data: room } = await ctx.supabase
    .from("classrooms")
    .select("id")
    .eq("id", input.classroom_id)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!room) throw new AdminError("Classroom not found", "not_found");

  const { data: teacherUser } = await ctx.supabase
    .from("users")
    .select("id")
    .eq("id", input.teacher_user_id)
    .eq("school_id", ctx.schoolId)
    .eq("role", "teacher")
    .eq("status", "active")
    .maybeSingle();
  if (!teacherUser) throw new AdminError("Teacher not found in this school", "not_found");

  const role = input.classroom_role ?? "support";
  if (role === "lead") {
    const { error: demoteErr } = await ctx.supabase
      .from("classroom_teacher_assignments")
      .update({ classroom_role: "support" })
      .eq("classroom_id", input.classroom_id)
      .eq("classroom_role", "lead")
      .is("end_date", null);
    if (demoteErr) throw new AdminError(demoteErr.message, "db_error");
  }

  return insertReturningId(ctx, "classroom_teacher_assignments", {
    teacher_user_id: input.teacher_user_id,
    classroom_id: input.classroom_id,
    classroom_role: role,
    start_date: input.start_date,
    end_date: null,
  });
}

export async function unassignTeacherFromClassroom(
  ctx: AdminContext,
  assignmentId: string,
  endDate: string
): Promise<void> {
  const { data: row, error: fetchErr } = await ctx.supabase
    .from("classroom_teacher_assignments")
    .select("id, classroom_id, end_date")
    .eq("id", assignmentId)
    .maybeSingle();
  if (fetchErr) throw new AdminError(fetchErr.message, "db_error");
  if (!row || row.end_date !== null) {
    throw new AdminError("Active assignment not found", "not_found");
  }

  const { data: room } = await ctx.supabase
    .from("classrooms")
    .select("id")
    .eq("id", row.classroom_id as string)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!room) throw new AdminError("Active assignment not found", "not_found");

  const { error } = await ctx.supabase
    .from("classroom_teacher_assignments")
    .update({ end_date: endDate })
    .eq("id", assignmentId)
    .is("end_date", null);
  if (error) throw new AdminError(error.message, "db_error");
}

/** Adds an active enrollment for a student in a classroom. If the student
 *  already has a primary active enrollment elsewhere, the new row is marked
 *  non-primary so the partial unique index on (student_id) is_primary=true is
 *  satisfied. */
export async function enrollStudentInClassroom(
  ctx: AdminContext,
  input: { student_id: string; classroom_id: string; start_date: string }
): Promise<string> {
  const { data: st } = await ctx.supabase
    .from("students")
    .select("id")
    .eq("id", input.student_id)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!st) throw new AdminError("Student not found", "not_found");

  const { data: room } = await ctx.supabase
    .from("classrooms")
    .select("id")
    .eq("id", input.classroom_id)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!room) throw new AdminError("Classroom not found", "not_found");

  const { data: dup } = await ctx.supabase
    .from("student_classroom_enrollments")
    .select("id")
    .eq("student_id", input.student_id)
    .eq("classroom_id", input.classroom_id)
    .is("end_date", null)
    .maybeSingle();
  if (dup) throw new AdminError("Already enrolled in this classroom", "conflict");

  const { data: primary } = await ctx.supabase
    .from("student_classroom_enrollments")
    .select("id")
    .eq("student_id", input.student_id)
    .is("end_date", null)
    .eq("is_primary", true)
    .maybeSingle();
  const isPrimary = !primary;

  return insertReturningId(ctx, "student_classroom_enrollments", {
    student_id: input.student_id,
    classroom_id: input.classroom_id,
    start_date: input.start_date,
    end_date: null,
    is_primary: isPrimary,
  });
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

/** Sets `classrooms.curriculum_id` (or clears it). Only active Montessori
 *  curricula in the same school; classroom must include the Montessori program
 *  when assigning a non-null curriculum. */
export async function setClassroomMontessoriCurriculum(
  ctx: AdminContext,
  classroomId: string,
  curriculumId: string | null
): Promise<void> {
  const { data: room } = await ctx.supabase
    .from("classrooms")
    .select("id, program_types")
    .eq("id", classroomId)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!room) throw new AdminError("Classroom not found", "not_found");

  const rawPrograms = (room as { program_types?: string[] | null }).program_types;
  const programs =
    Array.isArray(rawPrograms) && rawPrograms.length > 0 ? rawPrograms : (["montessori"] as const);

  if (curriculumId !== null && !programs.includes("montessori")) {
    throw new AdminError(
      "Add the Montessori program to this classroom before assigning a curriculum",
      "invalid"
    );
  }

  if (curriculumId !== null) {
    const { data: cur } = await ctx.supabase
      .from("curricula")
      .select("id, framework, is_active")
      .eq("id", curriculumId)
      .eq("school_id", ctx.schoolId)
      .maybeSingle();
    if (!cur || !(cur as { is_active?: boolean }).is_active) {
      throw new AdminError("Curriculum not found", "not_found");
    }
    const fw = String((cur as { framework?: string }).framework ?? "")
      .trim()
      .toLowerCase();
    if (fw !== "montessori") {
      throw new AdminError(
        "Only Montessori curricula can be assigned to a classroom here",
        "invalid"
      );
    }
  }

  const { error } = await ctx.supabase
    .from("classrooms")
    .update({ curriculum_id: curriculumId, updated_at: new Date().toISOString() })
    .eq("id", classroomId)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
}

export async function assignCurriculumToClassroom(
  ctx: AdminContext,
  classroomId: string,
  curriculumId: string
): Promise<void> {
  await setClassroomMontessoriCurriculum(ctx, classroomId, curriculumId);
}

// === Classroom groups ("teams" within a classroom) ===

/** Confirms a classroom belongs to the actor's school; returns its id or throws. */
async function assertClassroomInSchool(ctx: AdminContext, classroomId: string): Promise<void> {
  const { data: room } = await ctx.supabase
    .from("classrooms")
    .select("id")
    .eq("id", classroomId)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!room) throw new AdminError("Classroom not found", "not_found");
}

/** Loads a group + its classroom, scoped to the actor's school. */
async function getGroupInSchool(
  ctx: AdminContext,
  groupId: string
): Promise<{ id: string; classroom_id: string }> {
  const { data: group } = await ctx.supabase
    .from("classroom_groups")
    .select("id, classroom_id, classrooms!inner(school_id)")
    .eq("id", groupId)
    .maybeSingle();
  const row = group as {
    id: string;
    classroom_id: string;
    classrooms: { school_id: string } | null;
  } | null;
  if (!row || row.classrooms?.school_id !== ctx.schoolId) {
    throw new AdminError("Group not found", "not_found");
  }
  return { id: row.id, classroom_id: row.classroom_id };
}

export async function createClassroomGroup(
  ctx: AdminContext,
  input: { classroom_id: string; name: string; color?: string }
): Promise<string> {
  await assertClassroomInSchool(ctx, input.classroom_id);

  // Append to the end of the existing list.
  const { data: last } = await ctx.supabase
    .from("classroom_groups")
    .select("sort_order")
    .eq("classroom_id", input.classroom_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("classroom_groups")
    .insert({
      classroom_id: input.classroom_id,
      name: input.name.trim(),
      color: input.color ?? "terracotta",
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique_violation on (classroom_id, lower(name)).
    if ((error as { code?: string }).code === "23505") {
      throw new AdminError("A group with this name already exists in this classroom", "conflict");
    }
    throw new AdminError(error.message, "db_error");
  }
  return (data as { id: string }).id;
}

export async function updateClassroomGroup(
  ctx: AdminContext,
  input: { group_id: string; name?: string; color?: string; sort_order?: number }
): Promise<void> {
  await getGroupInSchool(ctx, input.group_id);

  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name.trim();
  if (input.color !== undefined) fields.color = input.color;
  if (input.sort_order !== undefined) fields.sort_order = input.sort_order;

  const { error } = await ctx.supabase
    .from("classroom_groups")
    .update(fields)
    .eq("id", input.group_id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AdminError("A group with this name already exists in this classroom", "conflict");
    }
    throw new AdminError(error.message, "db_error");
  }
}

export async function deleteClassroomGroup(ctx: AdminContext, groupId: string): Promise<void> {
  await getGroupInSchool(ctx, groupId);
  // Memberships cascade via the FK on classroom_group_members.group_id.
  const { error } = await ctx.supabase.from("classroom_groups").delete().eq("id", groupId);
  if (error) throw new AdminError(error.message, "db_error");
}

/** Assigns a child to a group (replacing any existing group in that classroom),
 *  or clears the assignment when `group_id` is null. The child must already be
 *  actively enrolled in the classroom. */
export async function setStudentGroup(
  ctx: AdminContext,
  input: { classroom_id: string; student_id: string; group_id: string | null }
): Promise<void> {
  await assertClassroomInSchool(ctx, input.classroom_id);

  const { data: enrollment } = await ctx.supabase
    .from("student_classroom_enrollments")
    .select("id")
    .eq("student_id", input.student_id)
    .eq("classroom_id", input.classroom_id)
    .is("end_date", null)
    .maybeSingle();
  if (!enrollment) throw new AdminError("Child is not enrolled in this classroom", "invalid");

  // Always clear the child's current group in this classroom first.
  const { error: delErr } = await ctx.supabase
    .from("classroom_group_members")
    .delete()
    .eq("classroom_id", input.classroom_id)
    .eq("student_id", input.student_id);
  if (delErr) throw new AdminError(delErr.message, "db_error");

  if (input.group_id === null) return;

  const group = await getGroupInSchool(ctx, input.group_id);
  if (group.classroom_id !== input.classroom_id) {
    throw new AdminError("Group does not belong to this classroom", "invalid");
  }

  const { error: insErr } = await ctx.supabase.from("classroom_group_members").insert({
    classroom_id: input.classroom_id,
    group_id: input.group_id,
    student_id: input.student_id,
  });
  if (insErr) throw new AdminError(insErr.message, "db_error");
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

export async function setCurriculumActive(
  ctx: AdminContext,
  curriculumId: string,
  isActive: boolean
): Promise<void> {
  const { data: row } = await ctx.supabase
    .from("curricula")
    .select("id")
    .eq("id", curriculumId)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (!row) throw new AdminError("Curriculum not found", "not_found");

  const { error } = await ctx.supabase
    .from("curricula")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", curriculumId)
    .eq("school_id", ctx.schoolId);
  if (error) throw new AdminError(error.message, "db_error");
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
