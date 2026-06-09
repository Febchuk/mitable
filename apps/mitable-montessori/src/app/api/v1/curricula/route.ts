import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import { listTeacherClassroomCurricula } from "@/lib/queries/curriculum-tree";

/** Curricula for classrooms this teacher is assigned to (not the whole school). */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    const curricula = await listTeacherClassroomCurricula(supabase, auth.user.userId);
    return NextResponse.json({ curricula });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load curricula" },
      { status: 500 }
    );
  }
}
