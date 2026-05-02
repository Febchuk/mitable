import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireGuardian } from "@/lib/api/guardian-auth";
import { createClient } from "@/utils/supabase/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGuardian();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // RLS gates the join — a guardian who isn't linked to this student gets [].
  const { data, error } = await supabase
    .from("attendance_records")
    .select("attendance_date, status, comment")
    .eq("student_id", id)
    .order("attendance_date", { ascending: false })
    .limit(180);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ attendance: data ?? [] });
}
