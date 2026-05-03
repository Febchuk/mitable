import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { AdminError, type AdminContext } from "@/lib/admin/crud";

/**
 * Boilerplate-compressing helper for the dozen+ /api/admin/* POST handlers.
 * Validates the body, constructs an AdminContext, runs the handler, audits the
 * result, and shapes errors consistently.
 */
export async function adminWriteRoute<T>(
  req: Request,
  schema: z.ZodSchema<T>,
  action: string,
  handler: (input: T, ctx: AdminContext) => Promise<{ id?: string; meta?: Record<string, unknown> }>
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const ctx: AdminContext = {
    supabase,
    schoolId: auth.user.schoolId,
    actorUserId: auth.user.userId,
  };

  try {
    const result = await handler(parsed.data, ctx);
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action,
      target_id: result.id,
      metadata: result.meta,
    });
    return NextResponse.json({ ok: true, ...result });
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
