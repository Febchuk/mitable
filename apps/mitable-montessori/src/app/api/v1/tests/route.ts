import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { firstIssue, sessionClient, testsDisabledResponse } from "@/lib/tests/api";

const CreateTestSchema = z.object({
  classroomId: z.string().uuid(),
  subject: z.string().trim().min(1, "Enter a subject").max(120),
  title: z.string().trim().min(1, "Enter a title").max(160),
});

export async function POST(req: Request) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = CreateTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const supabase = await sessionClient();
  const { data, error } = await supabase
    .from("tests")
    .insert({
      school_id: auth.user.schoolId,
      classroom_id: parsed.data.classroomId,
      subject: parsed.data.subject,
      title: parsed.data.title,
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Could not create the test" }, { status: 403 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
