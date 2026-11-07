import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { QuestionsInputSchema } from "@/lib/tests/model";
import { firstIssue, sessionClient, testsDisabledResponse } from "@/lib/tests/api";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = QuestionsInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const supabase = await sessionClient();
  const { error } = await supabase.rpc("save_test_questions", {
    p_test_id: id,
    p_questions: parsed.data.questions,
  });
  if (error)
    return NextResponse.json({ error: "Only a draft test can be edited" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
