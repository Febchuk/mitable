import type Anthropic from "@anthropic-ai/sdk";
import { REPORT_SYSTEM_PROMPT, REPORT_TOOLS } from "@/lib/anthropic/report-tools";
import { DraftReportToolCall, type DraftReportToolCallT } from "@/lib/schemas/report";
import {
  mergeReferenceSets,
  type ReportDataAdapter,
  type ReportReferenceSet,
} from "@/lib/reports/data-adapter";
import { validateTokenPreservation } from "@/lib/reports/token-preservation";

/** Subset of the Anthropic SDK we use — lets tests pass a fake. */
export interface AnthropicLike {
  messages: {
    create: (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export const MAX_AGENT_TURNS = 5;
export const MAX_REGENERATIONS = 2;

export interface AgentRunInput {
  studentToken: string;
  studentRef: string;
  classroomToken: string;
  classroomRef: string;
  reportType: "daily" | "major" | "incident";
  periodStart: string;
  periodEnd: string;
  adapter: ReportDataAdapter;
  anthropic: AnthropicLike;
  model: string;
}

export interface AgentRunOutput {
  draft: DraftReportToolCallT["args"];
  references: ReportReferenceSet;
  turns: number;
  regenerations: number;
}

export class AgentAbortError extends Error {
  constructor(
    message: string,
    public readonly reason: "max_turns" | "no_draft" | "validation_failed" | "tool_error"
  ) {
    super(message);
  }
}

/**
 * Run the small Sonnet agent loop. Returns the validated draft tool call along
 * with the merged reference set the client uses to de-tokenize for display.
 *
 * Hard caps:
 *   - 5 tool turns total
 *   - 2 regenerations on token-preservation failure (then we surface the
 *     failure to the caller; see Phase 3 plan §6)
 */
export async function runReportAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const accumulatedRefs: ReportReferenceSet[] = [];
  let attempts = 0;

  while (attempts <= MAX_REGENERATIONS) {
    attempts++;
    const conv: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildKickoff(input),
          },
        ],
      },
    ];

    let turn = 0;
    let draftCall: DraftReportToolCallT["args"] | null = null;

    while (turn < MAX_AGENT_TURNS) {
      turn++;
      const resp = await input.anthropic.messages.create({
        model: input.model,
        max_tokens: 4096,
        system: REPORT_SYSTEM_PROMPT,
        tools: REPORT_TOOLS,
        messages: conv,
      });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        // No tool call this turn — agent is stalling. Push it to call draft_report.
        if (turn >= MAX_AGENT_TURNS) {
          throw new AgentAbortError("Agent produced no tool call", "no_draft");
        }
        conv.push({ role: "assistant", content: resp.content });
        conv.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Please call draft_report now with what you have.",
            },
          ],
        });
        continue;
      }

      // Process tool uses.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUses) {
        if (block.name === "get_student_commands") {
          const args = block.input as { period_start: string; period_end: string };
          const data = await input.adapter.getStudentCommands({
            studentRef: input.studentRef,
            periodStart: args.period_start,
            periodEnd: args.period_end,
          });
          accumulatedRefs.push(data.references);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ commands: data.commands }),
          });
        } else if (block.name === "get_student_progress_summary") {
          const data = await input.adapter.getStudentProgressSummary({
            studentRef: input.studentRef,
          });
          accumulatedRefs.push(data.references);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ rows: data.rows }),
          });
        } else if (block.name === "draft_report") {
          const parsed = DraftReportToolCall.safeParse({
            tool: "draft_report",
            args: block.input,
          });
          if (!parsed.success) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Validation failed: ${JSON.stringify(parsed.error.flatten())}`,
            });
            continue;
          }
          draftCall = parsed.data.args;
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Unknown tool: ${block.name}`,
          });
        }
      }

      if (draftCall) {
        // Validate token preservation against the union of refs gathered so far.
        const merged = mergeReferenceSets(...accumulatedRefs);
        const validation = validateTokenPreservation(
          `${draftCall.title}\n\n${draftCall.draft_text}`,
          merged.refs
        );
        if (validation.ok) {
          return {
            draft: draftCall,
            references: merged,
            turns: turn,
            regenerations: attempts - 1,
          };
        }
        // Token preservation failed — bail out of this attempt and try again
        // from scratch with a stronger reminder.
        if (attempts > MAX_REGENERATIONS) {
          throw new AgentAbortError(
            `Token preservation failed after ${attempts} attempts: leaked=${validation.leakedNames.join(",")} unknown=${validation.unknownTokens.join(",")}`,
            "validation_failed"
          );
        }
        break; // restart outer attempt loop
      }

      conv.push({ role: "assistant", content: resp.content });
      conv.push({ role: "user", content: toolResults });
    }

    if (!draftCall) {
      if (attempts > MAX_REGENERATIONS) {
        throw new AgentAbortError(
          `Agent did not call draft_report within ${MAX_AGENT_TURNS} turns`,
          "max_turns"
        );
      }
      // restart attempt
    }
  }

  throw new AgentAbortError("Agent exhausted regeneration budget", "validation_failed");
}

function buildKickoff(input: AgentRunInput): string {
  return [
    `Draft a ${input.reportType} report.`,
    `Student token: ${input.studentToken}`,
    `Classroom token: ${input.classroomToken}`,
    `Period: ${input.periodStart} → ${input.periodEnd}`,
    "",
    "Use get_student_commands first, then get_student_progress_summary if you need it.",
    "Then call draft_report exactly once. Reference entities by token only.",
  ].join("\n");
}
