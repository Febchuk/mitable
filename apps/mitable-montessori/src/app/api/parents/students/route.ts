import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireGuardian } from "@/lib/api/guardian-auth";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const auth = await requireGuardian();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // RLS enforces the link; this query trusts that. We pull through the
  // student_guardians join so we can surface receives_reports per child to
  // the UI (e.g. show "reports off" badge).
  const { data, error } = await supabase
    .from("student_guardians")
    .select("receives_reports, students(id, first_name, last_name, preferred_name, archived_at)")
    .eq("guardian_id", auth.guardian.guardianId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const students = (data ?? [])
    .map((row) => {
      const r = row as {
        receives_reports: boolean;
        students:
          | {
              id: string;
              first_name: string;
              last_name: string;
              preferred_name: string | null;
              archived_at: string | null;
            }
          | {
              id: string;
              first_name: string;
              last_name: string;
              preferred_name: string | null;
              archived_at: string | null;
            }[]
          | null;
      };
      const s = Array.isArray(r.students) ? r.students[0] : r.students;
      if (!s || s.archived_at) return null;
      return {
        id: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        preferredName: s.preferred_name,
        receivesReports: r.receives_reports,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return NextResponse.json({ students });
}
