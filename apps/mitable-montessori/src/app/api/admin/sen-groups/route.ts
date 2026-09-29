import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/admin-auth";
import { auditLog } from "@/lib/audit/log";
import { createClient } from "@/utils/supabase/server";

const SenGroupActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_group"),
    classroomId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("set_member"),
    groupId: z.string().uuid(),
    studentId: z.string().uuid(),
    active: z.boolean(),
  }),
]);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const [{ data: groups, error: groupsError }, { data: classrooms, error: roomsError }] =
    await Promise.all([
      supabase
        .from("sen_report_groups")
        .select("id, name, classroom_id, classrooms!inner(name)")
        .eq("school_id", auth.user.schoolId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", auth.user.schoolId)
        .eq("status", "active")
        .order("name"),
    ]);
  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });
  if (roomsError) return NextResponse.json({ error: roomsError.message }, { status: 500 });

  const groupIds = (groups ?? []).map((group) => group.id as string);
  const classroomIds = (groups ?? []).map((group) => group.classroom_id as string);
  const [{ data: members, error: membersError }, { data: enrollments, error: enrollmentsError }] =
    await Promise.all([
      groupIds.length
        ? supabase
            .from("sen_report_group_members")
            .select("sen_report_group_id, student_id")
            .in("sen_report_group_id", groupIds)
            .is("left_on", null)
        : Promise.resolve({ data: [], error: null }),
      classroomIds.length
        ? supabase
            .from("student_classroom_enrollments")
            .select(
              "classroom_id, student_id, students!inner(first_name, last_name, preferred_name)"
            )
            .in("classroom_id", classroomIds)
            .is("end_date", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  if (enrollmentsError)
    return NextResponse.json({ error: enrollmentsError.message }, { status: 500 });

  const membersByGroup = new Map<string, string[]>();
  for (const member of members ?? []) {
    const groupId = member.sen_report_group_id as string;
    membersByGroup.set(groupId, [
      ...(membersByGroup.get(groupId) ?? []),
      member.student_id as string,
    ]);
  }
  const studentsByClassroom = new Map<string, Array<{ id: string; name: string }>>();
  for (const enrollment of enrollments ?? []) {
    const joined = enrollment.students as
      | { first_name: string; last_name: string; preferred_name: string | null }
      | Array<{ first_name: string; last_name: string; preferred_name: string | null }>
      | null;
    const student = Array.isArray(joined) ? joined[0] : joined;
    if (!student) continue;
    const classroomId = enrollment.classroom_id as string;
    studentsByClassroom.set(classroomId, [
      ...(studentsByClassroom.get(classroomId) ?? []),
      {
        id: enrollment.student_id as string,
        name: student.preferred_name?.trim() || `${student.first_name} ${student.last_name}`.trim(),
      },
    ]);
  }

  return NextResponse.json({
    classrooms: classrooms ?? [],
    groups: (groups ?? []).map((group) => {
      const joined = group.classrooms as { name: string } | Array<{ name: string }> | null;
      const classroom = Array.isArray(joined) ? joined[0] : joined;
      return {
        id: group.id,
        name: group.name,
        classroomId: group.classroom_id,
        classroomName: classroom?.name ?? "Classroom",
        memberIds: membersByGroup.get(group.id as string) ?? [],
        students: (studentsByClassroom.get(group.classroom_id as string) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      };
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = SenGroupActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid SEN setup request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const input = parsed.data;

  if (input.action === "create_group") {
    const { data: template, error: templateError } = await supabase
      .from("sen_report_templates")
      .select("id")
      .eq("school_id", auth.user.schoolId)
      .eq("name", "SEN Daily Report")
      .eq("is_active", true)
      .maybeSingle();
    if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 });
    if (!template) return NextResponse.json({ error: "SEN template not found" }, { status: 404 });

    const { data: group, error: groupError } = await supabase
      .from("sen_report_groups")
      .insert({
        school_id: auth.user.schoolId,
        classroom_id: input.classroomId,
        template_id: template.id,
        name: input.name,
        created_by_user_id: auth.user.userId,
      })
      .select("id")
      .single();
    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 400 });

    const { data: classroom, error: classroomError } = await supabase
      .from("classrooms")
      .select("program_types")
      .eq("id", input.classroomId)
      .eq("school_id", auth.user.schoolId)
      .maybeSingle();
    if (classroomError || !classroom) {
      return NextResponse.json(
        { error: classroomError?.message ?? "Classroom not found" },
        { status: 404 }
      );
    }
    const programTypes = Array.isArray(classroom.program_types)
      ? classroom.program_types
      : ["montessori"];
    if (!programTypes.includes("sen")) {
      const { error: programError } = await supabase
        .from("classrooms")
        .update({ program_types: [...programTypes, "sen"] })
        .eq("id", input.classroomId);
      if (programError) return NextResponse.json({ error: programError.message }, { status: 500 });
    }
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "sen_report_group_created",
      target_table: "sen_report_groups",
      target_id: group.id,
      metadata: { classroom_id: input.classroomId },
    });
    return NextResponse.json({ ok: true, id: group.id });
  }

  if (input.active) {
    const { error } = await supabase
      .from("sen_report_group_members")
      .upsert(
        {
          sen_report_group_id: input.groupId,
          student_id: input.studentId,
          joined_on: new Date().toISOString().slice(0, 10),
          left_on: null,
        },
        { onConflict: "sen_report_group_id,student_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await supabase
      .from("sen_report_group_members")
      .update({ left_on: new Date().toISOString().slice(0, 10) })
      .eq("sen_report_group_id", input.groupId)
      .eq("student_id", input.studentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: input.active ? "sen_report_member_added" : "sen_report_member_removed",
    target_table: "sen_report_group_members",
    metadata: { sen_report_group_id: input.groupId, student_id: input.studentId },
  });
  return NextResponse.json({ ok: true });
}
