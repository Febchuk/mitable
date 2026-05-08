import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { archiveStudent, AdminError } from "@/lib/admin/crud";

/**
 * Soft-delete (archive) a student for the admin's school. Sets `archived_at`;
 * roster queries hide archived students.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const adminCtx = {
    supabase,
    schoolId: auth.user.schoolId,
    actorUserId: auth.user.userId,
  };

  const { data: row, error: readErr } = await supabase
    .from("students")
    .select("id, archived_at")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.archived_at) {
    return NextResponse.json({ error: "Student is already removed" }, { status: 409 });
  }

  try {
    await archiveStudent(adminCtx, id, "admin_classroom_roster_remove");
  } catch (err) {
    if (err instanceof AdminError) {
      const status =
        err.code === "not_found"
          ? 404
          : err.code === "conflict"
            ? 409
            : err.code === "invalid"
              ? 400
              : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_archive_student",
    target_table: "students",
    target_id: id,
    metadata: { source: "admin_classrooms" },
  });

  return NextResponse.json({ ok: true });
}
