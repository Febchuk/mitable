import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";

const CreateSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: item } = await supabase
    .from("iep_items")
    .select("id, student_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", item.student_id as string)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("iep_comments")
    .insert({
      item_id: id,
      student_id: item.student_id as string,
      body: parsed.data.body.trim(),
      author_id: auth.user.userId,
    })
    .select("id, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to add comment", details: error?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: data.id, createdAt: data.created_at });
}
