import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { resolveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyProposal } from "@/lib/ai/teacher-agent/apply";
import { WRITE_TOOLS } from "@/lib/ai/teacher-agent/types";

const ApplyBodySchema = z.object({
  classroomId: z.string().uuid().optional(),
  proposal: z.object({
    id: z.string(),
    tool: z.enum(WRITE_TOOLS),
    summary: z.string(),
    args: z.record(z.unknown()),
  }),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = ApplyBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const classroom = await resolveClassroomForCurrentUser(parsed.data.classroomId);
  if (!classroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  const admin = createAdminClient();
  const result = await applyProposal({
    req,
    admin,
    schoolId: auth.user.schoolId,
    classroomId: classroom.id,
    proposal: parsed.data.proposal,
  });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "teacher_agent_apply",
    metadata: {
      classroom_id: classroom.id,
      tool: parsed.data.proposal.tool,
      ok: result.ok,
    },
  });

  return NextResponse.json(result);
}
