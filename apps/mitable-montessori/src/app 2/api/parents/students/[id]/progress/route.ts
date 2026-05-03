import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireGuardian } from "@/lib/api/guardian-auth";
import { createClient } from "@/utils/supabase/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGuardian();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("student_progress")
    .select(
      "curriculum_subtopic_id, status, comment, updated_at, curriculum_subtopics(name, curriculum_topics(name))"
    )
    .eq("student_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => {
    const row = r as {
      curriculum_subtopic_id: string;
      status: string;
      comment: string | null;
      updated_at: string;
      curriculum_subtopics:
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }[]
        | null;
    };
    const sub = Array.isArray(row.curriculum_subtopics)
      ? row.curriculum_subtopics[0]
      : row.curriculum_subtopics;
    const topic = sub
      ? Array.isArray(sub.curriculum_topics)
        ? sub.curriculum_topics[0]
        : sub.curriculum_topics
      : null;
    return {
      subtopicId: row.curriculum_subtopic_id,
      subtopicName: sub?.name ?? null,
      topicName: topic?.name ?? null,
      status: row.status,
      comment: row.comment,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({ progress: rows });
}
