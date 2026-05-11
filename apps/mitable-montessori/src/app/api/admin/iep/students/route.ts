import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

/**
 * Admin roster for the IEP tab. Returns active students in the admin's
 * school plus a count of domains/items they already have configured so the
 * chip row can hint which children still need a plan.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name")
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null)
    .order("first_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (students ?? []).map((s) => s.id as string);
  const counts = new Map<string, { domains: number; items: number }>();
  if (ids.length > 0) {
    const { data: domainRows } = await supabase
      .from("iep_domains")
      .select("student_id")
      .in("student_id", ids)
      .is("archived_at", null);
    for (const row of domainRows ?? []) {
      const sid = row.student_id as string;
      const cur = counts.get(sid) ?? { domains: 0, items: 0 };
      counts.set(sid, { ...cur, domains: cur.domains + 1 });
    }
    const { data: itemRows } = await supabase
      .from("iep_items")
      .select("student_id")
      .in("student_id", ids)
      .is("archived_at", null);
    for (const row of itemRows ?? []) {
      const sid = row.student_id as string;
      const cur = counts.get(sid) ?? { domains: 0, items: 0 };
      counts.set(sid, { ...cur, items: cur.items + 1 });
    }
  }

  return NextResponse.json({
    students: (students ?? []).map((s) => {
      const c = counts.get(s.id as string) ?? { domains: 0, items: 0 };
      return {
        id: s.id as string,
        firstName: s.first_name as string,
        lastName: s.last_name as string,
        preferredName: (s.preferred_name as string | null) ?? null,
        domainCount: c.domains,
        itemCount: c.items,
      };
    }),
  });
}
