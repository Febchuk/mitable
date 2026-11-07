import { NextResponse } from "next/server";
import { AnswerInputSchema, normalizeAnswer, type TestQuestion } from "@/lib/tests/model";
import { sessionClient, testsDisabledResponse } from "@/lib/tests/api";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const { id } = await params;
  const parsed = AnswerInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid answer" }, { status: 400 });

  const supabase = await sessionClient();
  const { data: question } = await supabase
    .from("test_questions")
    .select("kind, options")
    .eq("id", parsed.data.questionId)
    .maybeSingle();
  if (!question) return NextResponse.json({ error: "This test is closed" }, { status: 403 });
  const answer = normalizeAnswer(question as Pick<TestQuestion, "kind" | "options">, parsed.data);
  if (!answer) return NextResponse.json({ error: "Invalid answer" }, { status: 400 });

  const { error } = await supabase.from("test_answers").upsert({
    submission_id: id,
    question_id: parsed.data.questionId,
    selected_option: answer.selectedOption,
    answer_text: answer.answerText,
    answer_number: answer.answerNumber,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "This test is closed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
