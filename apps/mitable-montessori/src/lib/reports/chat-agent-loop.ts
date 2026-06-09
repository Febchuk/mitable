import type Anthropic from "@anthropic-ai/sdk";
import {
  CHAT_TERMINAL_TOOL_NAMES,
  CHAT_TOOLS,
  buildReportChatSystemPrompt,
  type ChatSectionRole,
} from "@/lib/anthropic/report-chat-tools";

export type { ChatSectionRole };
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
/** Room for several parallel terminal tool calls (e.g. one ghost-edit per section). */
export const CHAT_AGENT_MAX_OUTPUT_TOKENS = 4096;

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

export interface ChatAgentChipsPayload {
  body: string;
  chips: { id: string; label: string; prefill: string }[];
  tokenized: { body: string; chips: { label: string; prefill: string }[] };
}

export interface ChatAgentObsRefPayload {
  body: string;
  obs: {
    artifactId: string;
    quote: string;
    when: string;
    area?: string;
    source?: "photo" | "transcript" | "ocr";
  };
  suggestedTarget?: { sectionId: string; position: "append" | "after" | "new-paragraph" };
  tokenized: { body: string; quote: string };
}

export interface ChatAgentGhostEditPayload {
  body: string;
  target: { sectionId: string };
  ghostEdit: { id: string; html: string; sourceLabel: string };
  tokenized: { body: string; html: string; sourceLabel: string };
}

export interface ChatAgentNewSectionPayload {
  /** Detokenized confirmation body shown in chat. */
  body: string;
  /** Detokenized heading. */
  heading: string;
  /** Detokenized paragraph blocks for the new section, in order. */
  paragraphs: { id: string; html: string }[];
  /** When set, insert directly after this existing section. Otherwise append. */
  afterSectionId?: string;
  /** Server-stamped id for the new section so the client can address it. */
  sectionId: string;
  /** Tokenized snapshots kept for tool_trace. */
  tokenized: { body: string; heading: string; paragraphs: string[] };
}

/**
 * Search result returned by the `search_capture_artifacts` tool. The agent
 * sees these tokenized; the route layer is responsible for tokenizing
 * `quote` and `area` against the report's reference set before passing in.
 */
export interface ChatTokenizedArtifact {
  artifactId: string;
  /** Tokenized OCR text or transcript snippet. */
  quote: string;
  /** Display string for capturedAt (e.g. "10:14 AM"). */
  when: string;
  /** Optional area / heading hint (already tokenized). */
  area?: string;
  source?: "photo" | "transcript" | "ocr";
}

export type SearchArtifactsFn = (args: {
  query: string;
  limit: number;
}) => Promise<ChatTokenizedArtifact[]>;

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
  /**
   * Backend for `search_capture_artifacts`. The route is responsible for
   * tokenizing the result before returning. Optional — when omitted the
   * agent gets an empty array.
   */
  searchArtifacts?: SearchArtifactsFn;
  /** Classroom default template — comment sections only unless a new topic is needed. */
  defaultClassroomReport?: boolean;
}

export interface ChatTokenizedSection {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
  /** Set on default classroom reports so the agent knows which sections are editable. */
  sectionRole?: ChatSectionRole;
}

interface ChatAgentMeta {
  turns: number;
  regenerations: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of cache_creation_input_tokens across all SDK calls this turn. */
  cacheCreationInputTokens: number;
  /** Sum of cache_read_input_tokens across all SDK calls this turn. */
  cacheReadInputTokens: number;
}

export interface ChatAgentProseEmission {
  terminalKind: "prose" | "clarify";
  /** Detokenized body, ready for the wire / persistence. */
  body: string;
  /** Tokenized body the agent actually emitted (kept for tool_trace). */
  tokenizedBody: string;
}

export interface ChatAgentProposalEmission {
  terminalKind: "proposal";
  proposal: ChatAgentProposalPayload;
}

export interface ChatAgentChipsEmission {
  terminalKind: "chips";
  chips: ChatAgentChipsPayload;
}

export interface ChatAgentObsRefEmission {
  terminalKind: "obs-ref";
  obsRef: ChatAgentObsRefPayload;
}

export interface ChatAgentGhostEditEmission {
  terminalKind: "ghost-edit";
  ghostEdit: ChatAgentGhostEditPayload;
}

export interface ChatAgentNewSectionEmission {
  terminalKind: "new-section";
  newSection: ChatAgentNewSectionPayload;
}

export type ChatAgentEmission =
  | ChatAgentProseEmission
  | ChatAgentProposalEmission
  | ChatAgentChipsEmission
  | ChatAgentObsRefEmission
  | ChatAgentGhostEditEmission
  | ChatAgentNewSectionEmission;

/**
 * The agent may emit multiple terminal tool calls in a single turn (e.g. one
 * propose_rewrite per paragraph when the teacher's message implies edits to
 * several paragraphs at once). Each emission becomes its own assistant chat
 * message; meta is shared across the whole turn.
 */
export interface ChatAgentOutput extends ChatAgentMeta {
  emissions: ChatAgentEmission[];
}

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
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

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
        max_tokens: CHAT_AGENT_MAX_OUTPUT_TOKENS,
        // Phase 5: prompt caching. The system prompt is the highest-leverage
        // cache target — it's identical across every turn in a thread. Mark
        // the last tool with cache_control too so the tools block is reused.
        system: [
          {
            type: "text",
            text: buildReportChatSystemPrompt({
              defaultClassroomReport: input.defaultClassroomReport,
            }),
            cache_control: { type: "ephemeral" },
          } as Anthropic.TextBlockParam,
        ],
        tools: CHAT_TOOLS.map((t, i) =>
          i === CHAT_TOOLS.length - 1
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

      // Process this turn's tool uses. We expect either a read tool
      // (read_report_sections, search_capture_artifacts) or one or more
      // terminal tools (the agent may emit multiple proposals in one turn).
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      const terminalEmissions: ChatAgentEmission[] = [];
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
        if (block.name === "search_capture_artifacts") {
          const args = block.input as { query?: unknown; limit?: unknown };
          const query = typeof args.query === "string" ? args.query.trim() : "";
          const limitRaw = typeof args.limit === "number" ? Math.floor(args.limit) : 5;
          const limit = Math.max(1, Math.min(20, limitRaw));
          const results = input.searchArtifacts
            ? await input.searchArtifacts({ query, limit })
            : [];
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ artifacts: results }),
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
          const kind = block.name === "propose_prose_reply" ? "prose" : "clarify";
          terminalEmissions.push({
            terminalKind: kind,
            tokenizedBody,
            body: detokenizeReportText(tokenizedBody, input.references),
          });
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
          terminalEmissions.push({
            terminalKind: "proposal",
            proposal: {
              target: { sectionId, paragraphId },
              lead: detokenizeReportText(lead, input.references),
              oldText: detokenizeReportText(oldText, input.references),
              newText: detokenizeReportText(newText, input.references),
              rationale: rationale ? detokenizeReportText(rationale, input.references) : undefined,
              tokenized: { lead, oldText, newText, rationale },
            },
          });
          continue;
        }
        if (block.name === "propose_chips") {
          const args = block.input as { body?: unknown; chips?: unknown };
          const body = typeof args.body === "string" ? args.body.trim() : "";
          const chipsRaw = Array.isArray(args.chips) ? args.chips : [];
          const chips: { label: string; prefill: string }[] = [];
          for (const raw of chipsRaw) {
            if (raw && typeof raw === "object") {
              const r = raw as { label?: unknown; prefill?: unknown };
              const label = typeof r.label === "string" ? r.label.trim() : "";
              const prefill = typeof r.prefill === "string" ? r.prefill.trim() : "";
              if (label && prefill) chips.push({ label, prefill });
            }
          }
          if (!body || chips.length < 2 || chips.length > 4) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content:
                "propose_chips requires a non-empty body and 2–4 chips, each with non-empty label + prefill.",
            });
            continue;
          }
          const concatenated = [body, ...chips.flatMap((c) => [c.label, c.prefill])].join("\n");
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
          terminalEmissions.push({
            terminalKind: "chips",
            chips: {
              body: detokenizeReportText(body, input.references),
              chips: chips.map((c, i) => ({
                id: `c-${i}`,
                label: detokenizeReportText(c.label, input.references),
                prefill: detokenizeReportText(c.prefill, input.references),
              })),
              tokenized: { body, chips },
            },
          });
          continue;
        }
        if (block.name === "propose_observation_ref") {
          const args = block.input as {
            body?: unknown;
            obs?: {
              artifactId?: unknown;
              quote?: unknown;
              when?: unknown;
              area?: unknown;
              source?: unknown;
            };
            suggestedTarget?: { sectionId?: unknown; position?: unknown };
          };
          const body = typeof args.body === "string" ? args.body.trim() : "";
          const artifactId =
            typeof args.obs?.artifactId === "string" ? args.obs.artifactId.trim() : "";
          const quote = typeof args.obs?.quote === "string" ? args.obs.quote.trim() : "";
          const when = typeof args.obs?.when === "string" ? args.obs.when.trim() : "";
          const area =
            typeof args.obs?.area === "string" && args.obs.area.trim().length > 0
              ? args.obs.area.trim()
              : undefined;
          const source =
            args.obs?.source === "photo" ||
            args.obs?.source === "transcript" ||
            args.obs?.source === "ocr"
              ? args.obs.source
              : undefined;

          if (!body || !artifactId || !quote || !when) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content:
                "propose_observation_ref requires non-empty body and obs.{artifactId, quote, when}.",
            });
            continue;
          }
          // Body + quote get the leak validator. when/area are short server-stamped
          // display strings that the client passes through tokenized when needed,
          // so they go through detokenization but are NOT validated against refs
          // (they may legitimately reference areas not in the report).
          const validation = validateTokenPreservation([body, quote].join("\n"), refs);
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
          // suggestedTarget is structural — validate the sectionId exists if provided.
          let suggestedTarget:
            | { sectionId: string; position: "append" | "after" | "new-paragraph" }
            | undefined;
          if (args.suggestedTarget && typeof args.suggestedTarget === "object") {
            const sid =
              typeof args.suggestedTarget.sectionId === "string"
                ? args.suggestedTarget.sectionId
                : "";
            const sectionExists = input.tokenizedSections.some((s) => s.id === sid);
            if (sid && sectionExists) {
              const pos = args.suggestedTarget.position;
              suggestedTarget = {
                sectionId: sid,
                position: pos === "after" || pos === "new-paragraph" ? pos : "append",
              };
            }
          }
          terminalEmissions.push({
            terminalKind: "obs-ref",
            obsRef: {
              body: detokenizeReportText(body, input.references),
              obs: {
                artifactId,
                quote: detokenizeReportText(quote, input.references),
                when,
                area,
                source,
              },
              suggestedTarget,
              tokenized: { body, quote },
            },
          });
          continue;
        }
        if (block.name === "propose_ghost_edit") {
          const args = block.input as {
            body?: unknown;
            target?: { sectionId?: unknown };
            ghostEdit?: { html?: unknown; sourceLabel?: unknown };
          };
          const body = typeof args.body === "string" ? args.body.trim() : "";
          const sectionId = typeof args.target?.sectionId === "string" ? args.target.sectionId : "";
          const html = typeof args.ghostEdit?.html === "string" ? args.ghostEdit.html.trim() : "";
          const sourceLabel =
            typeof args.ghostEdit?.sourceLabel === "string"
              ? args.ghostEdit.sourceLabel.trim()
              : "";
          const sectionExists = input.tokenizedSections.some((s) => s.id === sectionId);
          if (!body || !sectionId || !sectionExists || !html || !sourceLabel) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content:
                "propose_ghost_edit requires body, target.sectionId (must exist), ghostEdit.html, ghostEdit.sourceLabel.",
            });
            continue;
          }
          const validation = validateTokenPreservation([body, html, sourceLabel].join("\n"), refs);
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
          terminalEmissions.push({
            terminalKind: "ghost-edit",
            ghostEdit: {
              body: detokenizeReportText(body, input.references),
              target: { sectionId },
              ghostEdit: {
                id: `g-${cryptoRandomId()}`,
                html: detokenizeReportText(html, input.references),
                sourceLabel: detokenizeReportText(sourceLabel, input.references),
              },
              tokenized: { body, html, sourceLabel },
            },
          });
          continue;
        }
        if (block.name === "propose_new_section") {
          const args = block.input as {
            body?: unknown;
            heading?: unknown;
            paragraphs?: unknown;
            afterSectionId?: unknown;
          };
          const body = typeof args.body === "string" ? args.body.trim() : "";
          const heading = typeof args.heading === "string" ? args.heading.trim() : "";
          const paragraphsRaw = Array.isArray(args.paragraphs) ? args.paragraphs : [];
          const paragraphs: string[] = [];
          for (const p of paragraphsRaw) {
            if (typeof p === "string" && p.trim().length > 0) paragraphs.push(p.trim());
          }
          const afterSectionIdRaw =
            typeof args.afterSectionId === "string" ? args.afterSectionId.trim() : "";
          // Validate optional afterSectionId only if provided. Empty string = append.
          let afterSectionId: string | undefined;
          if (afterSectionIdRaw) {
            const exists = input.tokenizedSections.some((s) => s.id === afterSectionIdRaw);
            if (!exists) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                is_error: true,
                content: `Unknown afterSectionId. Use a sectionId from read_report_sections, or omit to append. Got afterSectionId=${afterSectionIdRaw}.`,
              });
              continue;
            }
            afterSectionId = afterSectionIdRaw;
          }
          if (!body || !heading || paragraphs.length === 0) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content:
                "propose_new_section requires non-empty body, heading, and at least one paragraph.",
            });
            continue;
          }
          // Concatenate every prose field for one validator pass — leaks
          // anywhere abort the whole emission. Heading is included even
          // though it's usually generic, defense-in-depth.
          const validation = validateTokenPreservation(
            [body, heading, ...paragraphs].join("\n"),
            refs
          );
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
          terminalEmissions.push({
            terminalKind: "new-section",
            newSection: {
              body: detokenizeReportText(body, input.references),
              heading: detokenizeReportText(heading, input.references),
              paragraphs: paragraphs.map((html) => ({
                id: `p-${cryptoRandomId()}`,
                html: detokenizeReportText(html, input.references),
              })),
              ...(afterSectionId ? { afterSectionId } : {}),
              sectionId: `s-${cryptoRandomId()}`,
              tokenized: { body, heading, paragraphs },
            },
          });
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

      if (terminalEmissions.length > 0) {
        return {
          emissions: terminalEmissions,
          turns: turn,
          regenerations: attempts - 1,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheCreationInputTokens: totalCacheCreation,
          cacheReadInputTokens: totalCacheRead,
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

/** Short id for ghost edits — independent of the message id so the report pane
 *  can address the ghost slot directly. Falls back to Math.random when crypto
 *  isn't available (e.g. older Node test runners). */
function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export const __TEST__ = { tokenizeAgainstRefs };
