import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";

const QuerySchema = z.object({
  status: z.enum(["submitted_for_review", "in_review", "changes_requested", "approved"]).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, status, period_start, period_end, title, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });
  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  } else {
    query = query.in("status", [
      "submitted_for_review",
      "in_review",
      "changes_requested",
      "approved",
    ]);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}
