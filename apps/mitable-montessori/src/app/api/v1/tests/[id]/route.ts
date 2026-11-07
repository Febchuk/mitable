import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { firstIssue, sessionClient, testsDisabledResponse } from "@/lib/tests/api";

const UpdateTestSchema = z.object({
  subject: z.string().trim().min(1, "Enter a subject").max(120).optional(),
  title: z.string().trim().min(1, "Enter a title").max(160).optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["published", "closed"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = UpdateTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const supabase = await sessionClient();
  if (parsed.data.status === "published") {
    const { count } = await supabase
      .from("test_questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", id);
    if (!count)
      return NextResponse.json({ error: "Add at least one question first" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tests")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return NextResponse.json({ error: "Could not update the test" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const supabase = await sessionClient();
  const { data, error } = await supabase.from("tests").delete().eq("id", id).select("id");
  if (error || !data?.length)
    return NextResponse.json({ error: "Only a draft test can be deleted" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
