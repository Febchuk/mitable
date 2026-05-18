import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { scoreAndPersistReport } from "@/lib/reports/score-and-persist";
import { auditLog } from "@/lib/audit/log";

/**
 * Re-score a report on demand. Most scoring happens implicitly (autosave +
 * /submit), but the UI can hit this endpoint to refresh the score after
 * the user makes a meaningful edit they want graded immediately.
 *
 * Auth: any school user. Returns the new {score, flags, reasoning} body so
 * the UI can update its callout without a full page refresh.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id: reportId } = await ctx.params;

  const supabase = createAdminClient();

  // School-isolation: verify the report belongs to the user's school.
  const { data: report } = await supabase
    .from("reports")
    .select("id, students!inner(school_id)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const studentSchool = (report as unknown as { students: { school_id: string } | null }).students
    ?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  try {
    const result = await scoreAndPersistReport({ supabase, reportId });
    if (!result) {
      return NextResponse.json({ error: "Scoring returned no result" }, { status: 500 });
    }

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "report_scored",
      target_table: "reports",
      target_id: reportId,
      metadata: { score: result.score },
    });

    revalidatePath("/app/reports");
    revalidatePath("/admin/reports");

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Scoring failed" },
      { status: 500 }
    );
  }
}
