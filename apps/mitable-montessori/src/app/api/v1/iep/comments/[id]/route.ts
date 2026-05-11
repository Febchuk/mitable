import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();
  const { data: comment } = await supabase
    .from("iep_comments")
    .select("id, student_id")
    .eq("id", id)
    .maybeSingle();
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", comment.student_id as string)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase.from("iep_comments").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
