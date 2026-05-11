import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

/**
 * Full IEP plan for one child: domains (subjects) + their items (goals),
 * ordered by `position`. Archived rows are hidden — the editor only deals
 * with the live plan. Used by the admin curriculum IEP tab.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { data: domains, error: dErr } = await supabase
    .from("iep_domains")
    .select("id, name, position")
    .eq("student_id", studentId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  const { data: items, error: iErr } = await supabase
    .from("iep_items")
    .select("id, domain_id, name, position")
    .eq("student_id", studentId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (iErr) {
    return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  const itemsByDomain = new Map<string, Array<{ id: string; name: string; position: number }>>();
  for (const it of items ?? []) {
    const arr = itemsByDomain.get(it.domain_id as string) ?? [];
    arr.push({
      id: it.id as string,
      name: it.name as string,
      position: (it.position as number) ?? 0,
    });
    itemsByDomain.set(it.domain_id as string, arr);
  }

  return NextResponse.json({
    domains: (domains ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      position: (d.position as number) ?? 0,
      items: itemsByDomain.get(d.id as string) ?? [],
    })),
  });
}
