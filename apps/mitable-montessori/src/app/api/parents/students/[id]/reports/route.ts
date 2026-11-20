import { listPublishedReports } from "@/lib/parents/published-reports";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireGuardian } from "@/lib/api/guardian-auth";
import { createClient } from "@/utils/supabase/server";

/**
 * Reports explicitly sent to the guardian for one of their linked students.
 * RLS enforces the recipient relationship and sent status. We re-state
 * status='sent' here as defense-in-depth.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGuardian();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    return NextResponse.json({ reports: await listPublishedReports(supabase, id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load reports" },
      { status: 500 }
    );
  }
}
