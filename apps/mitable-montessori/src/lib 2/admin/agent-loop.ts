import type Anthropic from "@anthropic-ai/sdk";
import { ADMIN_SYSTEM_PROMPT, ADMIN_TOOLS, DESTRUCTIVE_TOOLS } from "@/lib/anthropic/admin-tools";
import { AdminTokenizer, type AdminTokenRef } from "@/lib/admin/tokenizer";
import {
  archiveStudent,
  archiveSubtopic,
  assignCurriculumToClassroom,
  assignTeacherToClassroom,
  linkGuardianToStudent,
  renameSubtopic,
  renameTopic,
  transferStudent,
  unassignTeacherFromClassroom,
  unlinkGuardianFromStudent,
  updateStudent,
  type AdminContext,
} from "@/lib/admin/crud";
import {
  findGuardianByName,
  findSubtopicByName,
  listClassrooms,
  listCurricula,
  listStudentsInClassroom,
  listSubtopics,
  listTopics,
} from "@/lib/admin/read-tools";

export const MAX_ADMIN_TURNS = 10;

export interface AnthropicLike {
  messages: {
    create: (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export interface AdminAgentOutput {
  /** Tool actions executed (post-confirmation for destructive ops). */
  executed: Array<{ tool: string; args: Record<string, unknown>; resultId?: string }>;
  /** Pending confirmations the client must surface to the admin. */
  pendingConfirmations: Array<{ tool: string; args: Record<string, unknown>; reason: string }>;
  /** Final assistant message text, if any. */
  finalMessage: string | null;
  /** Token references used during the session — for client de-tokenization. */
  references: AdminTokenRef[];
  turns: number;
}

export interface AdminAgentInput {
  prompt: string;
  /** Pre-existing references from a resumed session (or empty for new). */
  prefillReferences?: AdminTokenRef[];
  /** Confirmations granted by the admin since the last call (tool name + args). */
  approvedDestructive?: Array<{ tool: string; args: Record<string, unknown> }>;
  ctx: AdminContext;
  anthropic: AnthropicLike;
  model: string;
}

/**
 * Multi-turn admin agent. Yields back to the client with `pendingConfirmations`
 * any time the agent attempts a destructive operation that wasn't pre-approved.
 * The client surfaces the prompt, collects approval, and re-invokes with the
 * approval list populated.
 *
 * Persistence: the caller (route handler) writes an audit_log row on every
 * agent turn so the full session is auditable.
 */
export async function runAdminAgent(input: AdminAgentInput): Promise<AdminAgentOutput> {
  const tokenizer = AdminTokenizer.from(input.prefillReferences ?? []);
  const conv: Anthropic.MessageParam[] = [
    { role: "user", content: [{ type: "text", text: input.prompt }] },
  ];

  const executed: AdminAgentOutput["executed"] = [];
  const pendingConfirmations: AdminAgentOutput["pendingConfirmations"] = [];
  const approved = new Set(
    (input.approvedDestructive ?? []).map((a) => `${a.tool}:${JSON.stringify(a.args)}`)
  );

  let finalMessage: string | null = null;
  let turn = 0;

  while (turn < MAX_ADMIN_TURNS) {
    turn++;
    const resp = await input.anthropic.messages.create({
      model: input.model,
      max_tokens: 4096,
      system: ADMIN_SYSTEM_PROMPT,
      tools: ADMIN_TOOLS,
      messages: conv,
    });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

    if (toolUses.length === 0) {
      finalMessage =
        textBlocks
          .map((b) => b.text)
          .join("\n")
          .trim() || null;
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUses) {
      const args = (block.input ?? {}) as Record<string, unknown>;

      // Destructive — require confirmation.
      if (DESTRUCTIVE_TOOLS.has(block.name)) {
        const key = `${block.name}:${JSON.stringify(args)}`;
        if (!approved.has(key)) {
          pendingConfirmations.push({
            tool: block.name,
            args,
            reason: "Destructive operation requires admin confirmation",
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: "Awaiting admin confirmation. The dispatcher will re-invoke once approved.",
          });
          continue;
        }
      }

      try {
        const result = await dispatchTool(block.name, args, input.ctx, tokenizer);
        executed.push({ tool: block.name, args, resultId: result.id });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result.content),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Tool error: ${(err as Error).message}`,
        });
      }
    }

    if (pendingConfirmations.length > 0) {
      // Yield back to the client. The conversation is preserved in `conv` so a
      // resumed run can continue from here once approvals are collected.
      finalMessage =
        textBlocks
          .map((b) => b.text)
          .join("\n")
          .trim() || null;
      break;
    }

    conv.push({ role: "assistant", content: resp.content });
    conv.push({ role: "user", content: toolResults });
  }

  return {
    executed,
    pendingConfirmations,
    finalMessage,
    references: tokenizer.references(),
    turns: turn,
  };
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AdminContext,
  tokenizer: AdminTokenizer
): Promise<{ id?: string; content: unknown }> {
  const resolveTok = (token: unknown): string => {
    if (typeof token !== "string") throw new Error("Token must be a string");
    const ref = tokenizer.resolve(token);
    if (!ref) throw new Error(`Unknown token ${token}`);
    return ref.id;
  };
  const readCtx = { supabase: ctx.supabase, schoolId: ctx.schoolId, tokenizer };

  switch (name) {
    // ---- Read tools ----
    case "list_students_in_classroom":
      return {
        content: await listStudentsInClassroom(readCtx, resolveTok(args.classroom_token)),
      };
    case "list_classrooms":
      return { content: await listClassrooms(readCtx) };
    case "list_curricula":
      return { content: await listCurricula(readCtx) };
    case "list_topics":
      return { content: await listTopics(readCtx, resolveTok(args.curriculum_token)) };
    case "list_subtopics":
      return { content: await listSubtopics(readCtx, resolveTok(args.topic_token)) };
    case "find_subtopic_by_name":
      return {
        content: await findSubtopicByName(
          readCtx,
          resolveTok(args.curriculum_token),
          String(args.search)
        ),
      };
    case "find_guardian_by_name":
      return { content: await findGuardianByName(readCtx, String(args.search)) };

    // ---- Reference tools (writes) ----
    case "transfer_student": {
      const id = await transferStudent(ctx, {
        student_id: resolveTok(args.student_token),
        new_classroom_id: resolveTok(args.new_classroom_token),
        start_date: String(args.start_date),
      });
      return { id, content: { ok: true, enrollment_id: id } };
    }
    case "archive_student":
      await archiveStudent(ctx, resolveTok(args.student_token), String(args.reason));
      return { content: { ok: true } };
    case "update_student":
      await updateStudent(
        ctx,
        resolveTok(args.student_token),
        (args.fields as Record<string, unknown>) ?? {}
      );
      return { content: { ok: true } };
    case "assign_teacher_to_classroom": {
      const id = await assignTeacherToClassroom(ctx, {
        teacher_user_id: resolveTok(args.teacher_token),
        classroom_id: resolveTok(args.classroom_token),
        classroom_role: (args.classroom_role as "lead" | "support" | "assistant") ?? "support",
        start_date: String(args.start_date),
      });
      return { id, content: { ok: true, assignment_id: id } };
    }
    case "unassign_teacher_from_classroom":
      await unassignTeacherFromClassroom(ctx, String(args.assignment_id), String(args.end_date));
      return { content: { ok: true } };
    case "assign_curriculum_to_classroom":
      await assignCurriculumToClassroom(
        ctx,
        resolveTok(args.classroom_token),
        resolveTok(args.curriculum_token)
      );
      return { content: { ok: true } };
    case "link_guardian_to_student": {
      const id = await linkGuardianToStudent(ctx, {
        student_id: resolveTok(args.student_token),
        guardian_id: resolveTok(args.guardian_token),
        relationship:
          (args.relationship as "mother" | "father" | "guardian" | "other") ?? "guardian",
        is_primary_contact: Boolean(args.is_primary_contact),
        receives_reports:
          args.receives_reports === undefined ? true : Boolean(args.receives_reports),
      });
      return { id, content: { ok: true, link_id: id } };
    }
    case "unlink_guardian_from_student":
      await unlinkGuardianFromStudent(
        ctx,
        resolveTok(args.student_token),
        resolveTok(args.guardian_token)
      );
      return { content: { ok: true } };
    case "rename_subtopic":
      await renameSubtopic(ctx, resolveTok(args.subtopic_token), String(args.new_name));
      return { content: { ok: true } };
    case "archive_subtopic":
      await archiveSubtopic(ctx, resolveTok(args.subtopic_token));
      return { content: { ok: true } };
    case "rename_topic":
      await renameTopic(ctx, resolveTok(args.topic_token), String(args.new_name));
      return { content: { ok: true } };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
