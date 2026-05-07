import type Anthropic from "@anthropic-ai/sdk";
import {
  CHAT_TERMINAL_TOOL_NAMES,
  CHAT_TOOLS,
  REPORT_CHAT_SYSTEM_PROMPT,
} from "@/lib/anthropic/report-chat-tools";
import type { ReportReferenceSet } from "@/lib/reports/data-adapter";
import { detokenizeReportText } from "@/lib/reports/detokenize";
import { validateTokenPreservation } from "@/lib/reports/token-preservation";
import type { AnthropicLike } from "@/lib/reports/agent-loop";

/**
 * Phase 2 chat agent loop. Mirrors the draft agent's bounded-loop pattern but
 * with chat-shaped tools: one read tool (read_report_sections) that returns
 * tokenized text already prepared by the caller, plus two terminal tools
 * (propose_prose_reply, ask_clarifying_question).
 *
 * The agent reasons in tokens. Terminal-tool inputs are validated against the
 * report's reference set, then detokenized before persistence and before going
 * to the client. On validation failure, regenerate once with a stronger
 * reminder; second failure emits a synthetic clarify message rather than
 * propagating a 500.
 */

export const MAX_CHAT_TURNS_PER_REQUEST = 4;
export const MAX_CHAT_REGENERATIONS = 1;

export type ChatAgentTerminalKind = "prose" | "clarify" | "proposal";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  /**
   * Detokenized prose as it appears in the persisted thread. The loop will
   * re-tokenize each entry against the current reference set when assembling
   * Anthropic conversation context, so the agent sees tokens consistently.
   */
  body: string;
  targetHint?: string;
}

export interface ChatAgentProposalPayload {
  target: { sectionId: string; paragraphId: string };
  /** Detokenized — ready for the wire. */
  lead: string;
  oldText: string;
  newText: string;
  rationale?: string;
  /** Tokenized snapshot of every prose field — kept on tool_trace for debugging. */
  tokenized: {
    lead: string;
    oldText: string;
    newText: string;
    rationale?: string;
  };
}

export interface ChatAgentInput {
  anthropic: AnthropicLike;
  model: string;
  /** Tokenized sections returned by read_report_sections. Built once per turn. */
  tokenizedSections: ChatTokenizedSection[];
  /** Tokenized title (already in tokens). */
  tokenizedTitle: string;
  /** Reference set used for tokenizing reads + detokenizing emissions. */
  references: ReportReferenceSet;
  /** Detokenized chat history (oldest first). The loop will retokenize. */
  history: ChatHistoryTurn[];
  /** Detokenized user message for the new turn. */
  userMessage: string;
  /** Optional scope ("Morning paragraph"). Server-derived display string. */
  targetHint?: string;
}

export interface ChatTokenizedSection {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
}

interface ChatAgentMeta {
  turns: number;
  regenerations: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatAgentProseOutput extends ChatAgentMeta {
  terminalKind: "prose" | "clarify";
  /** Detokenized body, ready for the wire / persistence. */
  body: string;
  /** Tokenized body the agent actually emitted (kept for tool_trace). */
  tokenizedBody: string;
}

export interface ChatAgentProposalOutput extends ChatAgentMeta {
  terminalKind: "proposal";
  proposal: ChatAgentProposalPayload;
}

export type ChatAgentOutput = ChatAgentProseOutput | ChatAgentProposalOutput;

export class ChatAgentAbortError extends Error {
  constructor(
    message: string,
    public readonly reason: "max_turns" | "no_terminal" | "validation_failed"
  ) {
    super(message);
  }
}

export async function runReportChatAgent(input: ChatAgentInput): Promise<ChatAgentOutput> {
  const refs = input.references.refs.map((r) => ({ ...r }));
  // Tokenize the user-facing strings on the way IN so the agent sees the same
  // privacy-class text that the draft agent does. The references set is the
  // ground truth — if a display string isn't in it, it isn't tokenized.
  const tokenize = (text: string) => tokenizeAgainstRefs(text, refs);

  const tokenizedHistory = input.history.map((h) => ({
    role: h.role,
    body: tokenize(h.body),
    targetHint: h.targetHint,
  }));
  const tokenizedUserMessage = tokenize(input.userMessage);

  let attempts = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (attempts <= MAX_CHAT_REGENERATIONS) {
    attempts++;
    const conv: Anthropic.MessageParam[] = [];

    // Replay prior turns so the agent has continuity across the thread. Cap
    // at the most recent 20 to keep prompt cost bounded.
    for (const h of tokenizedHistory.slice(-20)) {
      conv.push({
        role: h.role,
        content: [{ type: "text", text: h.body }],
      });
    }
    conv.push({
      role: "user",
      content: [
        { type: "text", text: buildUserTurn(tokenizedUserMessage, input.targetHint, attempts > 1) },
      ],
    });

    let turn = 0;
    while (turn < MAX_CHAT_TURNS_PER_REQUEST) {
      turn++;
      const resp = await input.anthropic.messages.create({
        model: input.model,
        max_tokens: 1024,
        system: REPORT_CHAT_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        messages: conv,
      });
      totalInputTokens += resp.usage.input_tokens;
      totalOutputTokens += resp.usage.output_tokens;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (toolUses.length === 0) {
        if (turn >= MAX_CHAT_TURNS_PER_REQUEST) {
          throw new ChatAgentAbortError("Agent produced no tool call", "no_terminal");
        }
        // Nudge the agent to use a tool.
        conv.push({ role: "assistant", content: resp.content });
        conv.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Please respond by calling one of the provided tools.",
            },
          ],
        });
        continue;
      }

      // Process this turn's tool uses. We expect either read_report_sections
      // or one of the terminal tools.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let terminalEmission:
        | { kind: "prose" | "clarify"; tokenizedBody: string }
        | { kind: "proposal"; proposal: ChatAgentProposalPayload }
        | null = null;
      let validationFailed = false;

      for (const block of toolUses) {
        if (block.name === "read_report_sections") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({
              title: input.tokenizedTitle,
              sections: input.tokenizedSections,
            }),
          });
          continue;
        }
        if (block.name === "propose_prose_reply" || block.name === "ask_clarifying_question") {
          const args = block.input as { body?: unknown };
          const tokenizedBody = typeof args.body === "string" ? args.body.trim() : "";
          if (!tokenizedBody) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "body is required and must be a non-empty string.",
            });
            continue;
          }
          const validation = validateTokenPreservation(tokenizedBody, refs);
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
          terminalEmission = {
            kind: block.name === "propose_prose_reply" ? "prose" : "clarify",
            tokenizedBody,
          };
          continue;
        }
        if (block.name === "propose_rewrite") {
          const args = block.input as {
            target?: { sectionId?: unknown; paragraphId?: unknown };
            lead?: unknown;
            oldText?: unknown;
            newText?: unknown;
            rationale?: unknown;
          };
          const sectionId = typeof args.target?.sectionId === "string" ? args.target.sectionId : "";
          const paragraphId =
            typeof args.target?.paragraphId === "string" ? args.target.paragraphId : "";
          const lead = typeof args.lead === "string" ? args.lead.trim() : "";
          const oldText = typeof args.oldText === "string" ? args.oldText.trim() : "";
          const newText = typeof args.newText === "string" ? args.newText.trim() : "";
          const rationale =
            typeof args.rationale === "string" && args.rationale.trim().length > 0
              ? args.rationale.trim()
              : undefined;

          // Structural validation first — cheap to check, gives the agent a
          // clear retry signal rather than a privacy one.
          const targetExists = input.tokenizedSections.some(
            (s) => s.id === sectionId && s.paragraphs.some((p) => p.id === paragraphId)
          );
          if (!sectionId || !paragraphId || !targetExists) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Unknown target. Use a sectionId+paragraphId pair from read_report_sections. Got sectionId=${sectionId || "(empty)"}, paragraphId=${paragraphId || "(empty)"}.`,
            });
            continue;
          }
          if (!lead || !oldText || !newText) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: "lead, oldText, and newText are all required and must be non-empty strings.",
            });
            continue;
          }
          // Concatenate every prose field for one validator pass — leaks
          // anywhere abort the whole emission.
          const concatenated = [lead, oldText, newText, rationale ?? ""].join("\n");
          const validation = validateTokenPreservation(concatenated, refs);
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
          terminalEmission = {
            kind: "proposal",
            proposal: {
              target: { sectionId, paragraphId },
              lead: detokenizeReportText(lead, input.references),
              oldText: detokenizeReportText(oldText, input.references),
              newText: detokenizeReportText(newText, input.references),
              rationale: rationale ? detokenizeReportText(rationale, input.references) : undefined,
              tokenized: { lead, oldText, newText, rationale },
            },
          };
          continue;
        }
        if (CHAT_TERMINAL_TOOL_NAMES.has(block.name)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Tool ${block.name} is not supported in this phase.`,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Unknown tool: ${block.name}`,
          });
        }
      }

      if (terminalEmission) {
        const meta: ChatAgentMeta = {
          turns: turn,
          regenerations: attempts - 1,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        };
        if (terminalEmission.kind === "proposal") {
          return { terminalKind: "proposal", proposal: terminalEmission.proposal, ...meta };
        }
        return {
          terminalKind: terminalEmission.kind,
          tokenizedBody: terminalEmission.tokenizedBody,
          body: detokenizeReportText(terminalEmission.tokenizedBody, input.references),
          ...meta,
        };
      }

      if (validationFailed) {
        // Bail out of this attempt and retry from scratch with a stronger
        // reminder. The tokenizedUserMessage carries that reminder via
        // buildUserTurn(..., attempts > 1).
        if (attempts > MAX_CHAT_REGENERATIONS) {
          // Caller should emit a synthetic clarify rather than 500.
          throw new ChatAgentAbortError(
            "Token preservation failed after regeneration",
            "validation_failed"
          );
        }
        break;
      }

      // Otherwise the agent called a read tool — feed the result back and continue.
      conv.push({ role: "assistant", content: resp.content });
      conv.push({ role: "user", content: toolResults });
    }
  }

  throw new ChatAgentAbortError(
    `Agent did not call a terminal tool within ${MAX_CHAT_TURNS_PER_REQUEST} turns`,
    "max_turns"
  );
}

/**
 * Replace each known display string in `text` with its token. Whole-word,
 * case-insensitive. Mirrors the validator's substring rules in reverse.
 */
function tokenizeAgainstRefs(text: string, refs: ReportReferenceSet["refs"]): string {
  if (!text.trim()) return text;
  // Sort by display length descending so multi-word names tokenize before
  // their substrings (e.g. "Ada Okafor" before "Ada").
  const sorted = [...refs]
    .filter((r) => r.display && r.display.trim().length >= 2)
    .sort((a, b) => b.display.length - a.display.length);
  let out = text;
  for (const r of sorted) {
    const escaped = r.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    out = out.replace(re, r.token);
  }
  return out;
}

function leakReminder(validation: ReturnType<typeof validateTokenPreservation>): string {
  return `Token preservation failed. Leaked names: ${validation.leakedNames.join(", ") || "(none)"}. Unknown tokens: ${validation.unknownTokens.join(", ") || "(none)"}. Re-emit using only tokens already in the report (e.g. [STUDENT_1]).`;
}

function buildUserTurn(
  tokenizedUserMessage: string,
  targetHint: string | undefined,
  isRetry: boolean
): string {
  const lines: string[] = [];
  if (isRetry) {
    lines.push(
      "Reminder: in your last attempt you produced text that wasn't fully tokenized. Use ONLY tokens like [STUDENT_1] for any name. Do not write real names — the server detokenizes for the teacher."
    );
    lines.push("");
  }
  if (targetHint) {
    lines.push(`(Scoped to: ${targetHint})`);
    lines.push("");
  }
  lines.push(tokenizedUserMessage);
  return lines.join("\n");
}

export const __TEST__ = { tokenizeAgainstRefs };
