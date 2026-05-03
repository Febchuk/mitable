import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, HAIKU_MODEL } from "@/lib/anthropic/client";
import { TEACHER_SYSTEM_PROMPT, TEACHER_TOOLS } from "@/lib/anthropic/teacher-tools";
import { requireUser } from "@/lib/api/auth";
import { ParsedToolCallSchema, type ParsedToolCall } from "@/lib/schemas/parsed-tool-call";
import { TokenizedInputSchema } from "@/lib/schemas/tokenized-input";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = TokenizedInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { tokenizedText, references, classroomId, todayIso } = parsed.data;

  // Defense in depth: every token in the text must be present in the references list,
  // and all reference kinds must match what the LLM expects.
  const inlineTokens =
    tokenizedText.match(/\[(STUDENT|SUBTOPIC|CLASSROOM|GUARDIAN|USER)_\d+\]/g) ?? [];
  const refTokens = new Set(references.map((r) => r.token));
  const orphans = inlineTokens.filter((t) => !refTokens.has(t));
  if (orphans.length > 0) {
    return NextResponse.json({ error: "Orphan tokens in input", orphans }, { status: 400 });
  }

  // Append a synthetic [CLASSROOM_0] token referring to the active classroom so
  // the LLM has a token to pass into mark_attendance / record_progress.
  const classroomToken = "[CLASSROOM_0]";
  const augmentedRefs = [
    ...references,
    { token: classroomToken, ref: classroomId, kind: "classroom" as const },
  ];

  const anthropic = getAnthropic();

  const userMessage = [
    `Today is ${todayIso}.`,
    `Active classroom token: ${classroomToken} (always use this for classroom_token).`,
    `Tokens available in this turn:`,
    ...augmentedRefs
      .filter((r) => r.token !== classroomToken)
      .map((r) => `  ${r.token} → ${r.kind}`),
    `Active classroom: ${classroomToken}`,
    ``,
    `Teacher said:`,
    `"${tokenizedText}"`,
  ].join("\n");

  let toolCalls: ParsedToolCall[] = [];
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < 2) {
    attempt++;
    const resp = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: TEACHER_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TEACHER_TOOLS,
      messages: [{ role: "user", content: userMessage }],
    });

    const calls: ParsedToolCall[] = [];
    let validationFailed = false;
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const candidate = { tool: block.name, args: block.input };
      const result = ParsedToolCallSchema.safeParse(candidate);
      if (!result.success) {
        validationFailed = true;
        lastError = JSON.stringify(result.error.flatten());
        continue;
      }
      calls.push(result.data);
    }
    if (calls.length > 0 && !validationFailed) {
      toolCalls = calls;
      break;
    }
    if (calls.length > 0 && validationFailed) {
      // Take what we have and stop retrying — partial is better than none.
      toolCalls = calls;
      break;
    }
    // Otherwise loop and try one more time.
  }

  if (toolCalls.length === 0) {
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "parse_command_no_tools",
      metadata: { last_error: lastError, tokenized_text: tokenizedText },
    });
    return NextResponse.json(
      { toolCalls: [], note: "No tool calls produced", lastError },
      { status: 200 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "parse_command",
    target_table: "commands",
    metadata: {
      tokenized_text: tokenizedText,
      tool_count: toolCalls.length,
      tools: toolCalls.map((t) => t.tool),
    },
  });

  return NextResponse.json({ toolCalls });
}
