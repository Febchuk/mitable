import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { requireAdmin } from "@/lib/api/admin-auth";
import { runAdminAgent } from "@/lib/admin/agent-loop";
import { createClient } from "@/utils/supabase/server";

const RequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  prefillReferences: z
    .array(
      z.object({
        id: z.string(),
        token: z.string(),
        display: z.string(),
        kind: z.enum([
          "student",
          "guardian",
          "user",
          "classroom",
          "curriculum",
          "topic",
          "subtopic",
        ]),
      })
    )
    .optional(),
  approvedDestructive: z
    .array(
      z.object({
        tool: z.string().max(64),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: z.record(z.any()),
      })
    )
    .optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const result = await runAdminAgent({
    prompt: parsed.data.prompt,
    prefillReferences: parsed.data.prefillReferences,
    approvedDestructive: parsed.data.approvedDestructive,
    ctx: {
      supabase,
      schoolId: auth.user.schoolId,
      actorUserId: auth.user.userId,
    },
    anthropic: getAnthropic(),
    model: SONNET_MODEL,
  });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_agent_turn",
    metadata: {
      prompt: parsed.data.prompt,
      executed_count: result.executed.length,
      executed_tools: result.executed.map((e) => e.tool),
      pending_count: result.pendingConfirmations.length,
      turns: result.turns,
    },
  });

  return NextResponse.json(result);
}
