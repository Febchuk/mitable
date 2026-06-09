import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import { getCurriculumTree, teacherCanAccessCurriculum } from "@/lib/queries/curriculum-tree";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    const allowed = await teacherCanAccessCurriculum(supabase, auth.user.userId, id);
    if (!allowed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tree = await getCurriculumTree(supabase, {
      curriculumId: id,
      schoolId: auth.user.schoolId,
    });
    if (!tree) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ curriculum: tree });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load curriculum" },
      { status: 500 }
    );
  }
}
