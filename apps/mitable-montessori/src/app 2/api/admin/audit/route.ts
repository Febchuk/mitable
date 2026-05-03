import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";

const QuerySchema = z.object({
  actor: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  target: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    target: url.searchParams.get("target") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("audit_log")
    .select("id, actor_id, actor_role, action, target_table, target_id, metadata, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(parsed.data.limit);
  if (parsed.data.actor) query = query.eq("actor_id", parsed.data.actor);
  if (parsed.data.action) query = query.eq("action", parsed.data.action);
  if (parsed.data.target) query = query.eq("target_table", parsed.data.target);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}
