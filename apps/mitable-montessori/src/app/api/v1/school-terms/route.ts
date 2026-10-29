import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultSchoolTermId, listSchoolTerms } from "@/lib/queries/school-terms";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const terms = await listSchoolTerms(createAdminClient(), auth.user.schoolId);
    return NextResponse.json({ terms, defaultTermId: defaultSchoolTermId(terms) });
  } catch {
    return NextResponse.json(
      { error: "Couldn't load school terms. Please try again." },
      { status: 500 }
    );
  }
}
