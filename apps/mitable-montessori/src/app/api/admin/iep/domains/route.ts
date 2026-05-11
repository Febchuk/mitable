import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

const CreateSchema = z.object({
  studentId: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", parsed.data.studentId)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // New domain goes at the end. Cheap query: max(position).
  const { data: maxRow } = await supabase
    .from("iep_domains")
    .select("position")
    .eq("student_id", parsed.data.studentId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | null) ?? -1) + 1;

  const { data, error } = await supabase
    .from("iep_domains")
    .insert({
      student_id: parsed.data.studentId,
      school_id: auth.user.schoolId,
      name: parsed.data.name.trim(),
      position: nextPosition,
      created_by: auth.user.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create domain", details: error?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: data.id });
}
