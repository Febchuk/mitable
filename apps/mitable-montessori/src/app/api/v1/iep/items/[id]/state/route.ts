import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";

const StateSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  successCount: z.number().int().min(0).max(10).nullable().optional(),
  promptingCode: z.enum(["N", "G", "V", "H", "F"]).nullable().optional(),
});

/**
 * Upsert the current state (rating/completion/prompt) for one IEP item.
 * Teachers + admins can write. Auth gate verifies the item's student is in
 * the caller's school; RLS does the same belt-and-braces.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = StateSchema.safeParse(body);
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

  const row: Record<string, unknown> = {
    item_id: id,
    student_id: item.student_id as string,
    updated_by: auth.user.userId,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.rating !== undefined) row.rating = parsed.data.rating;
  if (parsed.data.successCount !== undefined) row.success_count = parsed.data.successCount;
  if (parsed.data.promptingCode !== undefined) row.prompting_code = parsed.data.promptingCode;

  const { error } = await supabase.from("iep_item_states").upsert(row, { onConflict: "item_id" });
  if (error) {
    return NextResponse.json(
      { error: "Failed to save state", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
