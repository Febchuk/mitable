import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const LEVELS = ["Emerging", "Practicing", "Deepening", "Leading"] as const;

const Body = z
  .object({
    axisKey: z.string().min(1),
    fromLevel: z.enum(LEVELS).nullable(),
    toLevel: z.enum(LEVELS).nullable(),
    note: z.string().min(1).max(2000),
  })
  .refine(
    (b) => {
      // Three legal shapes:
      //   null + null         → confirming note (axis level unchanged)
      //   null + <level>      → initial assessment (axis was never assessed)
      //   <level> + <level>   → transition between two assessed levels
      // The "<level> + null" shape (from set, to null) is rejected — it would
      // mean "ended the assessment without replacing it", which has no UX.
      if (b.fromLevel === null && b.toLevel === null) return true;
      if (b.fromLevel === null && b.toLevel !== null) return true;
      if (b.fromLevel !== null && b.toLevel !== null) return true;
      return false;
    },
    {
      message:
        "Allowed shapes: both null (confirming), only toLevel (initial assessment), or both set (transition).",
    }
  );

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Insert the observation. RLS confines this to students the teacher can see;
  // anything else surfaces as a 403 from postgres rather than us pre-checking.
  const { data: inserted, error: insertErr } = await supabase
    .from("whole_child_observations")
    .insert({
      student_id: studentId,
      axis_key: input.axisKey,
      from_level: input.fromLevel,
      to_level: input.toLevel,
      note: input.note,
      author_user_id: user.id,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    const isRlsDenial = /row-level security/i.test(insertErr?.message ?? "");
    return NextResponse.json(
      { error: insertErr?.message ?? "Insert failed" },
      { status: isRlsDenial ? 403 : 500 }
    );
  }

  // If the note advances the axis, end the prior assessment and insert a new one.
  if (input.toLevel) {
    const nowIso = new Date().toISOString();
    const { error: endErr } = await supabase
      .from("axis_assessments")
      .update({ ended_at: nowIso })
      .eq("student_id", studentId)
      .eq("axis_key", input.axisKey)
      .is("ended_at", null);
    if (endErr) {
      return NextResponse.json({ error: endErr.message }, { status: 500 });
    }
    const { error: newErr } = await supabase.from("axis_assessments").insert({
      student_id: studentId,
      axis_key: input.axisKey,
      level: input.toLevel,
      assessed_at: nowIso,
      source_observation_id: inserted.id,
      author_user_id: user.id,
    });
    if (newErr) {
      return NextResponse.json({ error: newErr.message }, { status: 500 });
    }
  }

  revalidatePath(`/app/children/${studentId}`);
  return NextResponse.json({ ok: true, id: inserted.id });
}
