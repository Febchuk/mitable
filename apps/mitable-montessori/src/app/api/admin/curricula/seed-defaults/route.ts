import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { ensureDefaultMontessoriCurricula } from "@/lib/curriculum/seed-default-montessori-curricula";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Idempotent: adds any of the five standard Montessori level curricula that are
 * not already present (matched by curriculum `name`).
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  try {
    const { inserted, skipped } = await ensureDefaultMontessoriCurricula(admin, {
      schoolId: auth.user.schoolId,
      createdByUserId: auth.user.userId,
    });
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: "admin",
      action: "admin_seed_default_montessori_curricula",
      target_table: "curricula",
      target_id: auth.user.schoolId,
      metadata: { inserted, skipped },
    });
    return NextResponse.json({ ok: true, inserted, skipped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 }
    );
  }
}
