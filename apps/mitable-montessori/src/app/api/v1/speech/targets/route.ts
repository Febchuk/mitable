import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";

/**
 * Teacher view: ordered speech targets for one student (same school).
 */
export async function GET(req: Request) {
  const auth = await requireUser();
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
