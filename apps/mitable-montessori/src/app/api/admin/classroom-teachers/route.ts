import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { AssignTeacherSchema, UnassignTeacherSchema } from "@/lib/schemas/admin";
import {
  assignTeacherToClassroom,
  unassignTeacherFromClassroom,
  AdminError,
} from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { auditLog } from "@/lib/audit/log";

export async function POST(req: Request) {
  return adminWriteRoute(req, AssignTeacherSchema, "admin_assign_teacher", async (input, ctx) => {
    const id = await assignTeacherToClassroom(ctx, input);
    return { id, meta: { role: input.classroom_role } };
  });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = UnassignTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const ctx = {
    supabase,
    schoolId: auth.user.schoolId,
    actorUserId: auth.user.userId,
  };

  try {
    await unassignTeacherFromClassroom(ctx, parsed.data.assignment_id, parsed.data.end_date);
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_unassign_teacher",
      target_id: parsed.data.assignment_id,
      metadata: { end_date: parsed.data.end_date },
    });
    return NextResponse.json({ ok: true });
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
}
