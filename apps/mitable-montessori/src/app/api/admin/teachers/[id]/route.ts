import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { auditLog } from "@/lib/audit/log";

const TeacherNameSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = createAdminClient();
  const { data: teacher, error } = await db
    .from("users")
    .select("id")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .eq("role", "teacher")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  const [rooms, assignments] = await Promise.all([
    db
      .from("classrooms")
      .select("id, name")
      .eq("school_id", auth.user.schoolId)
      .eq("status", "active")
      .order("name"),
    db
      .from("classroom_teacher_assignments")
      .select("id, classroom_id, classroom_role")
      .eq("teacher_user_id", id)
      .is("end_date", null),
  ]);
  if (rooms.error || assignments.error)
    return NextResponse.json({ error: "Couldn't load assignments" }, { status: 500 });
  return NextResponse.json({ classrooms: rooms.data, assignments: assignments.data });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = TeacherNameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a first name (up to 100 characters per name)" },
      { status: 400 }
    );
  const { data, error } = await createAdminClient()
    .from("users")
    .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName || null })
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .eq("role", "teacher")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "teacher.name_updated",
    target_table: "users",
    target_id: id,
  });
  return NextResponse.json({ ok: true });
}
