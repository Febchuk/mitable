import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/api/admin-auth";
import { searchGuardiansForSchool } from "@/lib/admin/guardian-search";
import { createClient } from "@/utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const studentId = url.searchParams.get("student_id") ?? undefined;
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: "Search must be between 2 and 100 characters" },
      { status: 400 }
    );
  }
  if (studentId && !UUID.test(studentId)) {
    return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const guardians = await searchGuardiansForSchool(
      supabase,
      auth.user.schoolId,
      query,
      studentId
    );
    return NextResponse.json({ guardians });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not search guardians" },
      { status: 500 }
    );
  }
}
