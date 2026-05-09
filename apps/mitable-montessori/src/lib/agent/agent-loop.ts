import type Anthropic from "@anthropic-ai/sdk";
import type { AnthropicLike } from "@/lib/reports/agent-loop";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { AGENT_TOOLS, TERMINAL_TOOL_NAMES } from "./agent-tools";
import { validateAgentOutput } from "@/lib/tokens/validate-output";
import { detokenize } from "@/lib/tokens/token-map";
import { makeToolContext, runGetStudentProgress, runSearchObservations } from "./tool-runner";
import type { TokenMap, TokenRef, ResolvedEntity } from "@/lib/tokens/types";
import type { RosterStudent } from "./roster";

/**
 * Bounded loop for the general chat agent. Mirrors the report-chat loop's
 * shape (`src/lib/reports/chat-agent-loop.ts`):
 *
 *   - At most MAX_TURNS_PER_REQUEST tool turns per user message.
 *   - On a validation failure the loop regenerates once with a stronger
 *     reminder before giving up.
 *   - On give-up, throws AgentAbortError; the route surfaces a synthetic
 *     reply rather than a 500.
 */

export const MAX_TURNS_PER_REQUEST = 4;
export const MAX_REGENERATIONS = 1;

export interface AgentHistoryTurn {
  role: "user" | "assistant";
  /** Tokenized prose as it was persisted. */
  body: string;
}

export interface AgentLoopInput {
  anthropic: AnthropicLike;
  model: string;
  history: AgentHistoryTurn[];
  /** The current user message, already redacted to tokens. */
  userMessageTokenized: string;
  /** The token map; tools may extend it. */
  tokenMap: TokenMap;
  /** Backing array of refs the tokenMap was built from. Tools push to this. */
  refs: TokenRef[];
  /** Roster scope for tool execution. */
  roster: RosterStudent[];
}

export interface AgentLoopOutput {
  /** Final detokenized prose. */
  body: string;
  /** Final tokenized prose (what we persist + log). */
  bodyTokenized: string;
  entities: ResolvedEntity[];
  turns: number;
  regenerations: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export class AgentAbortError extends Error {
  constructor(
    message: string,
    public readonly reason: "max_turns" | "no_terminal" | "validation_failed"
  ) {
    super(message);
  }
}

function leakReminder(validation: { leakedNames: string[]; unknownTokens: string[] }): string {
  const parts: string[] = [];
  if (validation.leakedNames.length > 0) {
    parts.push(
      `These display names appeared verbatim in your reply and must be replaced with their {{student:UUID}} tokens: ${validation.leakedNames.join(", ")}.`
    );
  }
  if (validation.unknownTokens.length > 0) {
    parts.push(
      `These tokens are NOT in the student set you're allowed to reference: ${validation.unknownTokens.join(", ")}. Don't invent UUIDs — only use tokens you've seen in the conversation or tool results.`
    );
  }
  return parts.join(" ");
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopOutput> {
  const ctx = makeToolContext({
    roster: input.roster,
    tokenMap: input.tokenMap,
    refs: input.refs,
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let attempts = 0;

  while (attempts <= MAX_REGENERATIONS) {
    attempts++;
    const conv: Anthropic.MessageParam[] = [];

    // Replay history so the agent has continuity. Cap at the most recent 20
    // messages to bound prompt cost.
    for (const h of input.history.slice(-20)) {
      conv.push({ role: h.role, content: [{ type: "text", text: h.body }] });
    }
    conv.push({
      role: "user",
      content: [
        {
          type: "text",
          text:
            attempts > 1
              ? `${input.userMessageTokenized}\n\n(Reminder: only use {{student:UUID}} tokens that appear in this conversation or tool results. Never use names verbatim.)`
              : input.userMessageTokenized,
        },
      ],
    });

    let turn = 0;
    while (turn < MAX_TURNS_PER_REQUEST) {
      turn++;
      const resp = await input.anthropic.messages.create({
        model: input.model,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: AGENT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          } as Anthropic.TextBlockParam,
        ],
        tools: AGENT_TOOLS.map((t, i) =>
          i === AGENT_TOOLS.length - 1
            ? ({ ...t, cache_control: { type: "ephemeral" } } as Anthropic.Tool)
            : t
        ),
        messages: conv,
      });
      totalInputTokens += resp.usage.input_tokens;
      totalOutputTokens += resp.usage.output_tokens;
      totalCacheCreation += resp.usage.cache_creation_input_tokens ?? 0;
      totalCacheRead += resp.usage.cache_read_input_tokens ?? 0;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (toolUses.length === 0) {
        if (turn >= MAX_TURNS_PER_REQUEST) {
          throw new AgentAbortError("Agent produced no tool call", "no_terminal");
        }
        conv.push({ role: "assistant", content: resp.content });
        conv.push({
          role: "user",
          content: [{ type: "text", text: "Please respond by calling one of the provided tools." }],
        });
        continue;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let terminalBody: string | null = null;
      let validationFailed = false;

      for (const block of toolUses) {
        if (block.name === "get_student_progress") {
          const args = block.input as { studentId?: unknown };
          const studentId = typeof args.studentId === "string" ? args.studentId : "";
          const result = await runGetStudentProgress(ctx, { studentId });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          continue;
        }
        if (block.name === "search_observations") {
          const args = block.input as { studentIds?: unknown; query?: unknown };
          const studentIds = Array.isArray(args.studentIds)
            ? args.studentIds.filter((x): x is string => typeof x === "string").slice(0, 10)
            : [];
          const query = typeof args.query === "string" ? args.query : undefined;
          const result = await runSearchObservations(ctx, { studentIds, query });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          continue;
        }
        if (TERMINAL_TOOL_NAMES.has(block.name)) {
          const args = block.input as { body?: unknown };
          const body = typeof args.body === "string" ? args.body.trim() : "";
          if (!body) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "body is required and must be a non-empty string.",
            });
            continue;
          }
          const validation = validateAgentOutput(body, input.tokenMap);
          if (!validation.ok) {
            validationFailed = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: leakReminder(validation),
            });
            continue;
          }
          terminalBody = body;
          continue;
        }
        // Unknown tool — should never happen, but fail closed.
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Unknown tool: ${block.name}.`,
        });
      }

      if (terminalBody && !validationFailed) {
        const det = detokenize(terminalBody, input.tokenMap);
        return {
          body: det.text,
          bodyTokenized: terminalBody,
          entities: det.entities,
          turns: turn,
          regenerations: attempts - 1,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheCreationInputTokens: totalCacheCreation,
          cacheReadInputTokens: totalCacheRead,
        };
      }

      // Continue the loop — feed the tool results back to the model so it
      // can call more tools or produce a terminal.
      conv.push({ role: "assistant", content: resp.content });
      conv.push({ role: "user", content: toolResults });

      if (validationFailed) {
        // Break out of the inner turn loop so we regenerate from scratch
        // (with the stronger reminder) rather than continuing this run.
        break;
      }
    }
  }

  throw new AgentAbortError("Agent exceeded retry budget", "validation_failed");
}
