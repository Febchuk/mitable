import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const TRANSITIONS = ["introduced", "practicing", "mastered"] as const;

const Body = z.object({
  subtopicId: z.string().uuid(),
  comment: z.string().min(1).max(2000),
  transitionToStatus: z.enum(TRANSITIONS).nullable(),
});

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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Insert the event row. RLS confines this to teacher-visible students;
  // anything else surfaces as a 403 from postgres.
  const { data: inserted, error: insertErr } = await supabase
    .from("curriculum_events")
    .insert({
      student_id: studentId,
      subtopic_id: input.subtopicId,
      comment: input.comment,
      transition_to_status: input.transitionToStatus,
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

  // Optionally bump student_progress + history. We need classroom_id for the
  // unique (student, subtopic, classroom) key — pull the student's current
  // primary enrollment.
  if (input.transitionToStatus) {
    const { data: enrollment } = await supabase
      .from("student_classroom_enrollments")
      .select("classroom_id")
      .eq("student_id", studentId)
      .is("end_date", null)
      .order("is_primary", { ascending: false })
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle<{ classroom_id: string }>();

    if (!enrollment) {
      // We've already saved the event; just skip the projection update and
      // let the client know it was a partial success.
      return NextResponse.json({
        ok: true,
        id: inserted.id,
        warning: "No active classroom enrollment — student_progress not updated.",
      });
    }

    // Read the prior status so we can write a clean history transition.
    const { data: existing } = await supabase
      .from("student_progress")
      .select("id, status")
      .eq("student_id", studentId)
      .eq("curriculum_subtopic_id", input.subtopicId)
      .eq("classroom_id", enrollment.classroom_id)
      .maybeSingle<{ id: string; status: string }>();

    const { data: upserted, error: upsertErr } = await supabase
      .from("student_progress")
      .upsert(
        {
          student_id: studentId,
          curriculum_subtopic_id: input.subtopicId,
          classroom_id: enrollment.classroom_id,
          status: input.transitionToStatus,
          updated_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,curriculum_subtopic_id,classroom_id" }
      )
      .select("id")
      .single();
    if (upsertErr || !upserted) {
      return NextResponse.json(
        { error: upsertErr?.message ?? "Progress upsert failed" },
        { status: 500 }
      );
    }

    const { error: histErr } = await supabase.from("student_progress_history").insert({
      student_progress_id: upserted.id,
      student_id: studentId,
      curriculum_subtopic_id: input.subtopicId,
      previous_status: existing?.status ?? null,
      new_status: input.transitionToStatus,
      comment: input.comment,
      changed_by_user_id: user.id,
    });
    if (histErr) {
      return NextResponse.json({ error: histErr.message }, { status: 500 });
    }
  }

  revalidatePath(`/app/children/${studentId}`);
  return NextResponse.json({ ok: true, id: inserted.id });
}
