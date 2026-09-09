import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import {
  isElementaryClassroomCode,
  resolveClassroomForCurrentUser,
} from "@/lib/app/active-classroom";
import { createAdminClient } from "@/utils/supabase/admin";
import { fetchRoster } from "@/lib/ai/teacher-agent/read-tools";
import { runTeacherAgentTurn } from "@/lib/ai/teacher-agent/run";

const TurnBodySchema = z.object({
  classroomId: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = TurnBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Only a teacher with an active classroom assignment can reach the agent.
  const classroom = await resolveClassroomForCurrentUser(parsed.data.classroomId);
  if (!classroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  const admin = createAdminClient();
  const roster = await fetchRoster(admin, classroom.id);

  let result;
  try {
    result = await runTeacherAgentTurn({
      admin,
      schoolId: auth.user.schoolId,
      classroomId: classroom.id,
      ctx: {
        todayIso: new Date().toISOString().slice(0, 10),
        classroomName: classroom.name,
        roster,
        isElementary: isElementaryClassroomCode(classroom.code),
      },
      messages: parsed.data.messages,
    });
  } catch (err) {
    // Missing/invalid GEMINI_API_KEY or an upstream Gemini failure lands here.
    const message = err instanceof Error ? err.message : "Agent failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "teacher_agent_turn",
    metadata: {
      classroom_id: classroom.id,
      proposal_count: result.proposals.length,
      proposed_tools: result.proposals.map((p) => p.tool),
    },
  });

  return NextResponse.json(result);
}
