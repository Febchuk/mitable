import { NextResponse } from "next/server";
import { findGuardianInSchool, inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

/** Lists the active children linked to one guardian, with report-delivery settings. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const { data: guardian } = await findGuardianInSchool(id, auth.key.schoolId);
  if (!guardian) return inaccessibleResource("Guardian");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_guardians")
    .select(
      "relationship, is_primary_contact, receives_reports, students!inner(id, first_name, last_name, preferred_name, birth_date, school_id, archived_at)"
    )
    .eq("guardian_id", id)
    .eq("students.school_id", auth.key.schoolId)
    .is("students.archived_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data ?? [] });
}
