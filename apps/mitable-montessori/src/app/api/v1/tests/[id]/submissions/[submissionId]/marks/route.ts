import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { firstIssue, sessionClient, testsDisabledResponse } from "@/lib/tests/api";

const MarksSchema = z.object({
  marks: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        points: z.number().finite().min(0),
        comment: z.string().trim().max(4000).nullable(),
      })
    )
    .max(200),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, submissionId } = await params;
  const parsed = MarksSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const supabase = await sessionClient();
  const { data: questions } = await supabase
    .from("test_questions")
    .select("id, points")
    .eq("test_id", id);
  const maximums = new Map(
    ((questions ?? []) as { id: string; points: number | string }[]).map((question) => [
      question.id,
      Number(question.points),
    ])
  );
  for (const mark of parsed.data.marks) {
    const maximum = maximums.get(mark.questionId);
    if (maximum === undefined)
      return NextResponse.json({ error: "That question isn't in this test" }, { status: 400 });
    if (mark.points > maximum)
      return NextResponse.json(
        { error: `A mark can't be more than the question's ${maximum} points` },
        { status: 400 }
      );
  }

  const { data: submission } = await supabase
    .from("test_submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("test_id", id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const { error } = await supabase.from("test_marks").upsert(
    parsed.data.marks.map((mark) => ({
      submission_id: submissionId,
      question_id: mark.questionId,
      points: mark.points,
      comment: mark.comment,
      marked_by_user_id: auth.user.userId,
      marked_at: new Date().toISOString(),
    }))
  );
  if (error) return NextResponse.json({ error: "Could not save the marks" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
