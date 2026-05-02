import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { ImportRosterSchema } from "@/lib/schemas/admin";
import { parseCsv, planRosterImport } from "@/lib/admin/csv";
import { createStudent } from "@/lib/admin/crud";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = ImportRosterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Pull existing names for conflict detection.
  const { data: existing } = await supabase
    .from("students")
    .select("first_name, last_name")
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null);
  const existingNames = new Set(
    (existing ?? []).map(
      (s) =>
        `${(s as { first_name: string }).first_name.toLowerCase()} ${(s as { last_name: string }).last_name.toLowerCase()}`
    )
  );

  const csv = parseCsv(parsed.data.csv_data);
  const plan = planRosterImport(csv, existingNames);

  if (parsed.data.dry_run) {
    return NextResponse.json({
      dry_run: true,
      ok: true,
      plan: {
        rowsToImport: plan.rows.length,
        conflicts: plan.conflicts,
        totalRows: csv.rowCount,
      },
    });
  }

  if (plan.conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "Conflicts present; resolve before non-dry-run import",
        conflicts: plan.conflicts,
      },
      { status: 409 }
    );
  }

  const ctx = {
    supabase,
    schoolId: auth.user.schoolId,
    actorUserId: auth.user.userId,
  };
  const inserted: string[] = [];
  for (const row of plan.rows) {
    const id = await createStudent(ctx, row);
    inserted.push(id);
    await supabase.from("student_classroom_enrollments").insert({
      student_id: id,
      classroom_id: parsed.data.classroom_id,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: null,
      is_primary: true,
    });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_import_roster",
    metadata: {
      classroom_id: parsed.data.classroom_id,
      inserted_count: inserted.length,
      total_rows: csv.rowCount,
    },
  });

  return NextResponse.json({ ok: true, insertedCount: inserted.length, ids: inserted });
}
