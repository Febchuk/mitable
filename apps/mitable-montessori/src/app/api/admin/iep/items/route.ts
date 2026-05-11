import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

const CreateSchema = z.object({
  domainId: z.string().uuid(),
  name: z.string().min(1).max(160),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: domain } = await supabase
    .from("iep_domains")
    .select("id, school_id, student_id")
    .eq("id", parsed.data.domainId)
    .maybeSingle();
  if (!domain || (domain.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const { data: maxRow } = await supabase
    .from("iep_items")
    .select("position")
    .eq("domain_id", parsed.data.domainId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | null) ?? -1) + 1;

  const { data, error } = await supabase
    .from("iep_items")
    .insert({
      domain_id: parsed.data.domainId,
      student_id: domain.student_id as string,
      name: parsed.data.name.trim(),
      position: nextPosition,
      created_by: auth.user.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create item", details: error?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: data.id });
}
