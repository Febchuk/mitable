import { NextResponse } from "next/server";
import { z } from "zod";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Resolves an email against this school. This is deliberately an exact lookup
 * for the workflow's initial identity check; it never searches other schools.
 */
export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const email = new URL(request.url).searchParams.get("email")?.trim();
  if (!email || !z.string().email().safeParse(email).success)
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  const admin = createAdminClient();
  const [staffResult, guardianResult] = await Promise.all([
    admin
      .from("users")
      .select("id, role, first_name, last_name, email, status")
      .eq("school_id", auth.key.schoolId)
      .ilike("email", email)
      .eq("status", "active"),
    admin
      .from("guardians")
      .select(
        "id, first_name, last_name, email, preferred_contact_method, auth_user_id, onboarding_completed_at"
      )
      .eq("school_id", auth.key.schoolId)
      .ilike("email", email),
  ]);
  if (staffResult.error || guardianResult.error)
    return NextResponse.json(
      { error: staffResult.error?.message ?? guardianResult.error?.message },
      { status: 500 }
    );
  const guardianIds = (guardianResult.data ?? []).map((guardian) => guardian.id);
  const { data: childLinks, error: linksError } = guardianIds.length
    ? await admin
        .from("student_guardians")
        .select(
          "guardian_id, relationship, receives_reports, students!inner(id, first_name, last_name, preferred_name, school_id, archived_at)"
        )
        .in("guardian_id", guardianIds)
        .eq("students.school_id", auth.key.schoolId)
        .is("students.archived_at", null)
    : { data: [], error: null };
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
  const childrenByGuardian = new Map<string, unknown[]>();
  for (const link of childLinks ?? []) {
    const list = childrenByGuardian.get(link.guardian_id) ?? [];
    list.push(link);
    childrenByGuardian.set(link.guardian_id, list);
  }
  return NextResponse.json({
    staff: staffResult.data ?? [],
    guardians: (guardianResult.data ?? []).map(({ auth_user_id, ...guardian }) => ({
      ...guardian,
      accountActive: Boolean(auth_user_id),
      children: childrenByGuardian.get(guardian.id) ?? [],
    })),
  });
}
