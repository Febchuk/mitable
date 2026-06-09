import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateClassroomSchema, PatchClassroomSchema } from "@/lib/schemas/admin";
import {
  createClassroom,
  setClassroomMontessoriCurriculum,
  updateClassroomName,
  updateClassroomPrograms,
} from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const schoolId = auth.user.schoolId;

  const { data: classrooms, error: cErr } = await supabase
    .from("classrooms")
    .select("id, name, code, status, curriculum_id, program_types")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("name");

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const roomRows = classrooms ?? [];
  const curriculumIds = [
    ...new Set(roomRows.map((r) => r.curriculum_id).filter((id): id is string => Boolean(id))),
  ];

  const curriculumNameById = new Map<string, string>();
  if (curriculumIds.length > 0) {
    const { data: curricula } = await supabase
      .from("curricula")
      .select("id, name")
      .in("id", curriculumIds);
    for (const c of curricula ?? []) {
      curriculumNameById.set((c as { id: string }).id, (c as { name: string }).name);
    }
  }

  const roomIds = roomRows.map((r) => r.id as string);

  const assignsByRoom = new Map<
    string,
    Array<{
      id: string;
      teacher_user_id: string;
      classroom_role: string | null;
    }>
  >();
  if (roomIds.length > 0) {
    const { data: assigns } = await supabase
      .from("classroom_teacher_assignments")
      .select("id, classroom_id, classroom_role, teacher_user_id")
      .in("classroom_id", roomIds)
      .is("end_date", null);

    for (const a of assigns ?? []) {
      const row = a as {
        id: string;
        classroom_id: string;
        classroom_role: string | null;
        teacher_user_id: string;
      };
      const list = assignsByRoom.get(row.classroom_id) ?? [];
      list.push({
        id: row.id,
        teacher_user_id: row.teacher_user_id,
        classroom_role: row.classroom_role,
      });
      assignsByRoom.set(row.classroom_id, list);
    }
  }

  // Groups ("teams") per classroom + each child's group membership.
  const groupsByRoom = new Map<
    string,
    Array<{ id: string; name: string; color: string; sortOrder: number }>
  >();
  const groupIdByStudentRoom = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: groupRows } = await supabase
      .from("classroom_groups")
      .select("id, classroom_id, name, color, sort_order")
      .in("classroom_id", roomIds)
      .order("sort_order");
    for (const g of groupRows ?? []) {
      const row = g as {
        id: string;
        classroom_id: string;
        name: string;
        color: string | null;
        sort_order: number | null;
      };
      const list = groupsByRoom.get(row.classroom_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        color: row.color ?? "terracotta",
        sortOrder: row.sort_order ?? 0,
      });
      groupsByRoom.set(row.classroom_id, list);
    }

    const { data: memberRows } = await supabase
      .from("classroom_group_members")
      .select("classroom_id, student_id, group_id")
      .in("classroom_id", roomIds);
    for (const m of memberRows ?? []) {
      const row = m as { classroom_id: string; student_id: string; group_id: string };
      groupIdByStudentRoom.set(`${row.classroom_id}:${row.student_id}`, row.group_id);
    }
  }

  const allTeacherIds = new Set<string>();
  assignsByRoom.forEach((list) => list.forEach((x) => allTeacherIds.add(x.teacher_user_id)));

  const teacherNameById = new Map<string, string>();
  if (allTeacherIds.size > 0) {
    const { data: teacherUsers } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", [...allTeacherIds]);
    for (const u of teacherUsers ?? []) {
      const row = u as { id: string; first_name: string | null; last_name: string | null };
      teacherNameById.set(
        row.id,
        `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Teacher"
      );
    }
  }

  const { data: curriculumListRows } = await supabase
    .from("curricula")
    .select("id, name, framework")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("name");

  const montessoriCurricula = (curriculumListRows ?? [])
    .filter(
      (row) =>
        String((row as { framework?: string }).framework ?? "")
          .trim()
          .toLowerCase() === "montessori"
    )
    .map((row) => {
      const c = row as { id: string; name: string };
      return { id: c.id, name: c.name };
    });

  const classroomsOut = roomRows.map((r) => {
    const id = r.id as string;
    const assigns = assignsByRoom.get(id) ?? [];
    const teachers = assigns.map((a) => ({
      assignmentId: a.id,
      userId: a.teacher_user_id,
      name: teacherNameById.get(a.teacher_user_id) ?? "Teacher",
      role: a.classroom_role ?? "support",
    }));
    const lead = assigns.find((a) => a.classroom_role === "lead") ?? assigns[0] ?? null;

    const rawPrograms = (r as { program_types?: string[] | null }).program_types;
    const programTypes =
      Array.isArray(rawPrograms) && rawPrograms.length > 0
        ? (rawPrograms.filter((p) => ["montessori", "iep", "speech"].includes(p)) as Array<
            "montessori" | "iep" | "speech"
          >)
        : (["montessori"] as const);

    return {
      id,
      name: r.name as string,
      code: (r.code as string | null) ?? null,
      curriculumId: (r.curriculum_id as string | null) ?? null,
      curriculumName: r.curriculum_id
        ? (curriculumNameById.get(r.curriculum_id as string) ?? null)
        : null,
      teachers,
      leadTeacherId: lead?.teacher_user_id ?? null,
      programTypes,
      groups: groupsByRoom.get(id) ?? [],
    };
  });

  const { data: teacherPool } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("school_id", schoolId)
    .eq("role", "teacher")
    .eq("status", "active")
    .order("last_name");

  const teachers = (teacherPool ?? []).map((u) => {
    const row = u as { id: string; first_name: string | null; last_name: string | null };
    return {
      id: row.id,
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Teacher",
    };
  });

  const roster: Array<{
    id: string;
    classroomId: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    birthDate: string | null;
    enrolledStart: string;
    groupId: string | null;
    guardians: Array<{
      relationship: string | null;
      firstName: string;
      lastName: string;
      email: string | null;
    }>;
  }> = [];

  if (roomIds.length > 0) {
    const { data: enrollments, error: enrErr } = await supabase
      .from("student_classroom_enrollments")
      .select("classroom_id, start_date, student_id")
      .in("classroom_id", roomIds)
      .is("end_date", null);

    if (enrErr) {
      return NextResponse.json({ error: enrErr.message }, { status: 500 });
    }

    const enrollmentRows = (enrollments ?? []) as Array<{
      classroom_id: string;
      start_date: string;
      student_id: string;
    }>;

    const studentIds = [...new Set(enrollmentRows.map((e) => e.student_id))];

    type StudentRow = {
      id: string;
      first_name: string;
      last_name: string;
      preferred_name: string | null;
      birth_date: string | null;
      archived_at: string | null;
    };

    const studentById = new Map<string, StudentRow>();
    if (studentIds.length > 0) {
      const { data: studentRows, error: stErr } = await supabase
        .from("students")
        .select("id, first_name, last_name, preferred_name, birth_date, archived_at")
        .in("id", studentIds);

      if (stErr) {
        return NextResponse.json({ error: stErr.message }, { status: 500 });
      }

      for (const s of studentRows ?? []) {
        const row = s as StudentRow;
        studentById.set(row.id, row);
      }
    }

    for (const e of enrollmentRows) {
      const s = studentById.get(e.student_id);
      if (!s || s.archived_at !== null) continue;
      roster.push({
        id: s.id,
        classroomId: e.classroom_id,
        firstName: s.first_name,
        lastName: s.last_name,
        preferredName: s.preferred_name,
        birthDate: s.birth_date,
        enrolledStart: e.start_date,
        groupId: groupIdByStudentRoom.get(`${e.classroom_id}:${s.id}`) ?? null,
        guardians: [],
      });
    }

    const rosterStudentIds = roster.map((r) => r.id);
    if (rosterStudentIds.length > 0) {
      const { data: links, error: lgErr } = await supabase
        .from("student_guardians")
        .select("student_id, relationship, guardians(first_name, last_name, email)")
        .in("student_id", rosterStudentIds);

      if (lgErr) {
        return NextResponse.json({ error: lgErr.message }, { status: 500 });
      }

      type GRow = {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      };

      const guardsByStudent = new Map<string, (typeof roster)[0]["guardians"]>();
      for (const r of roster) guardsByStudent.set(r.id, []);

      for (const raw of links ?? []) {
        const link = raw as {
          student_id: string;
          relationship: string | null;
          guardians: GRow | GRow[] | null;
        };
        const g = Array.isArray(link.guardians) ? link.guardians[0] : link.guardians;
        if (!g) continue;
        const list = guardsByStudent.get(link.student_id);
        if (!list) continue;
        list.push({
          relationship: link.relationship,
          firstName: g.first_name ?? "",
          lastName: g.last_name ?? "",
          email: g.email,
        });
      }

      for (const row of roster) {
        row.guardians = guardsByStudent.get(row.id) ?? [];
      }
    }
  }

  return NextResponse.json({
    classrooms: classroomsOut,
    teachers,
    roster,
    montessoriCurricula,
  });
}

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateClassroomSchema,
    "admin_create_classroom",
    async (input, ctx) => {
      const id = await createClassroom(ctx, input);
      return { id };
    }
  );
}

export async function PATCH(req: Request) {
  return adminWriteRoute(req, PatchClassroomSchema, "admin_patch_classroom", async (input, ctx) => {
    if (input.name !== undefined) {
      await updateClassroomName(ctx, {
        classroom_id: input.classroom_id,
        name: input.name,
      });
    }
    if (input.program_types) {
      await updateClassroomPrograms(ctx, {
        classroom_id: input.classroom_id,
        program_types: input.program_types,
      });
    }
    if (input.curriculum_id !== undefined) {
      await setClassroomMontessoriCurriculum(ctx, input.classroom_id, input.curriculum_id);
    }
    return {
      id: input.classroom_id,
      meta: {
        updated_name: input.name !== undefined,
        updated_programs: Boolean(input.program_types),
        updated_curriculum: input.curriculum_id !== undefined,
      },
    };
  });
}
