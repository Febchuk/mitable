import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

const PostSchema = z.object({
  studentId: z.string().uuid(),
  label: z.string().min(1).max(500),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("speech_targets")
    .select("id, label, position")
    .eq("student_id", studentId)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    targets: (rows ?? []).map((r) => ({
      id: r.id as string,
      label: r.label as string,
      position: r.position as number,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
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
  const schoolId = student.school_id as string;

  const { data: maxRow } = await supabase
    .from("speech_targets")
    .select("position")
    .eq("student_id", parsed.data.studentId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | null) ?? -1) + 1;

  const { data, error } = await supabase
    .from("speech_targets")
    .insert({
      student_id: parsed.data.studentId,
      school_id: schoolId,
      label: parsed.data.label.trim(),
      position: nextPosition,
      created_by: auth.user.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create target", details: error?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: data.id });
}
