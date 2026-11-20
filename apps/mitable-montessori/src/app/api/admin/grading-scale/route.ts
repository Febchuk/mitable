import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { GradingScaleSchema } from "@/lib/grades/grading-scale";
import { getSchoolGradingScale } from "@/lib/queries/grading-scale";
import { createAdminClient } from "@/utils/supabase/admin";
import { auditLog } from "@/lib/audit/log";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({
      scale: await getSchoolGradingScale(createAdminClient(), auth.user.schoolId),
    });
  } catch {
    return NextResponse.json({ error: "Could not load the grading scale" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = GradingScaleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const scale = parsed.data;
  const { error } = await createAdminClient().from("elementary_grading_scales").upsert(
    {
      school_id: auth.user.schoolId,
      a_min: scale.aMin,
      b_min: scale.bMin,
      c_min: scale.cMin,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "school_id" }
  );
  if (error)
    return NextResponse.json({ error: "Could not save the grading scale" }, { status: 500 });
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "grading_scale.update",
    target_table: "elementary_grading_scales",
    target_id: auth.user.schoolId,
    metadata: scale,
  });
  return NextResponse.json({ scale });
}
