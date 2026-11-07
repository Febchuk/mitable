import { NextResponse } from "next/server";
import { sessionClient, testsDisabledResponse } from "@/lib/tests/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const { id } = await params;
  const supabase = await sessionClient();
  const { data: studentId } = await supabase.rpc("current_student_id");
  if (!studentId) return NextResponse.json({ error: "Student sign-in required" }, { status: 401 });

  const { error } = await supabase
    .from("test_submissions")
    .upsert(
      { test_id: id, student_id: studentId },
      { onConflict: "test_id,student_id", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: "This test isn't open" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
