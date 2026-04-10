/**
 * Refinement RLM Service
 *
 * Conversational summary refinement agent with tool-calling capabilities.
 * Primary: Anthropic native tool_use (Claude Sonnet 4.5 with extended thinking)
 * Fallback: OpenAI GPT-5 single-shot (all context pre-loaded, no tool loop)
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../../../config";
import {
  REFINEMENT_TOOL_DEFINITIONS,
  executeRefinementTool,
  type RefinementContext,
} from "./refinement-tools";
import { createLogger } from "../../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "refinement-rlm" });

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RefinementRLMInput {
  sessionId: string;
  userId: string;
  orgId: string;
  messages: ChatMessage[];
  currentSummary: string;
}

export interface RefinementRLMResult {
  message: string;
  suggestedEdit: string | null;
  toolCallCount: number;
}

// --------------------------------------------------------------------------
// System prompt
// --------------------------------------------------------------------------

function buildSystemPrompt(currentSummary: string): string {
  return `You are a summary refinement assistant for Mitable, a work session tracking tool.
The user has a session summary they want to improve. You have tools to look up session data on-demand.

## Current Summary Being Edited
${currentSummary}

## Your Tools
You have tools to fetch session data. Use them when you need specific details:
- get_timeline_stats: understand session scope before diving in
- get_activities: fetch specific activities by index range
- get_transcripts: fetch audio transcripts (optionally by time window)
- get_classifications: get classifier data (action types, entities, metrics)
- filter_by_type: filter activities by type (VIEWING, AUTHORING, EDITING, etc.)
- get_user_preferences: check saved user preferences for summary style
- save_user_preference: save a user preference about summary style

## MANDATORY: User Preferences
User memories are the core of personalization. You MUST follow this protocol:

1. **On FIRST message of every conversation**: call get_user_preferences to load existing preferences. Apply them to ALL summary rewrites.
2. **Whenever the user expresses ANY preference about summaries**: call save_user_preference IMMEDIATELY. This includes:
   - Format preferences ("bullet points", "narrative", "concise")
   - Tone preferences ("professional", "casual", "for my manager")
   - Audience preferences ("I'm sending this to my team", "this is for my boss")
   - Content preferences ("don't tell me what I did", "focus on outcomes", "skip the timestamps")
   - Length preferences ("shorter", "more detail", "keep it brief")
   - Structure preferences ("use headings", "no headers", "numbered list")
3. **Do NOT ask the user if they want to save a preference** — just save it. Every preference matters.
4. **If the user corrects a rewrite** (e.g., "no, I meant bullet points not paragraphs"), that is ALSO a preference to save.

## When to Use Data Tools
- User asks to "add more detail" → fetch activities and transcripts for the relevant section
- User asks to "focus on meetings" → filter_by_type for relevant action types
- User mentions something not in the summary → get_activities to find it
- Simple style changes (tone, format, length) → rewrite directly, no tools needed

## Response Format — CRITICAL
Whenever you make ANY change to the summary (corrections, additions, rewrites, restructuring), you MUST respond with BOTH:

1. A brief conversational message (1-2 sentences) explaining what you changed
2. The COMPLETE rewritten summary wrapped in <summary> tags

Example:
I've restructured it as a narrative focusing on outcomes. I also added the debugging context from the transcripts.

<summary>
[full rewritten summary here — use markdown formatting]
</summary>

**NEVER claim you've made changes without including the <summary> block.** If you say "I've corrected/updated/revised" but omit <summary> tags, the user will NOT see any changes. The <summary> block is the ONLY mechanism that applies your edits.

Only omit <summary> tags when you are genuinely just answering a question or chatting — NOT when making any edit.

## CRITICAL: Data Boundary Rules
- You are STRICTLY limited to data from THIS session only. Never invent, assume, or hallucinate information.
- Every fact, app name, person name, URL, and action in the summary MUST come from tool results (activities, transcripts, classifications).
- If the user asks you to add something that doesn't appear in the session data, say so: "I couldn't find that in the session data. Could you clarify?"
- Do NOT use your general knowledge to fill gaps. If the session data doesn't mention it, it didn't happen.
- Preserve attribution: if someone else performed an action ("Observed [Name]..."), attribute it to them, not the user.

## Session Metadata Rules
- Do NOT include session date, duration, start/end time, or other session metadata in the summary unless the user explicitly asks for it.
- The summary should focus on WHAT happened, not WHEN or HOW LONG it took.
- If the user asks you to add date/duration info, then include it. Otherwise, omit it entirely.

## Style Rules
- Use markdown in summaries: headings, bold, bullet points, links where appropriate
- Apply ALL saved user preferences to every summary rewrite
- Be concise in conversational messages, detailed in summary rewrites`;
}

// --------------------------------------------------------------------------
// Response parser
// --------------------------------------------------------------------------

function parseResponse(raw: string): { message: string; suggestedEdit: string | null } {
  const match = raw.match(/<summary>([\s\S]*?)<\/summary>/);
  if (match) {
    const suggestedEdit = match[1].trim();
    const message = raw.replace(/<summary>[\s\S]*?<\/summary>/, "").trim();
    return { message: message || "Here's the revised summary:", suggestedEdit };
  }

  // Safety net: detect when LLM claims to have edited but didn't include <summary> tags
  const claimsEdit =
    /\b(corrected|revised|updated|rewritten|restructured|rewrote|changed|modified|added|removed|replaced|adjusted)\b/i.test(
      raw
    );
  if (claimsEdit) {
    logger.warn("LLM claimed to edit summary but did not include <summary> tags — nudging retry");
  }

  return { message: raw.trim(), suggestedEdit: null };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

class RefinementRLMService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;
  private maxToolRounds = 6; // Safety limit for tool-calling rounds

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Refinement RLM using Claude Sonnet 4.5 with native tool_use");
    }
    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info("GPT-5 fallback configured for Refinement RLM");
    }
    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek V3.2 (deepseek-chat) configured for Refinement RLM (last resort)");
    }
  }

  async refine(input: RefinementRLMInput): Promise<RefinementRLMResult> {
    const ctx: RefinementContext = {
      sessionId: input.sessionId,
      userId: input.userId,
      orgId: input.orgId,
    };

    if (this.anthropic) {
      try {
        return await this.refineWithClaude(input, ctx);
      } catch (error) {
        logger.warn({ error: String(error) }, "Claude refinement failed — falling back to GPT-5");
      }
    }

    if (this.openai) {
      try {
        return await this.refineWithOpenAI(input, ctx);
      } catch (error) {
        logger.warn(
          { error: String(error) },
          "OpenAI refinement also failed — trying DeepSeek V3.2"
        );
      }
    }

    return this.refineWithDeepSeek(input);
  }

  // --------------------------------------------------------------------------
  // Primary: Anthropic native tool_use
  // --------------------------------------------------------------------------

  private async refineWithClaude(
    input: RefinementRLMInput,
    ctx: RefinementContext
  ): Promise<RefinementRLMResult> {
    const systemPrompt = buildSystemPrompt(input.currentSummary);

    // Build Anthropic message history from chat messages
    // Inject current summary context into first user message
    const anthropicMessages: Anthropic.MessageParam[] = input.messages.map((m, i) => ({
      role: m.role,
      content:
        i === 0 && m.role === "user"
          ? `[User's request about the summary above:]\n${m.content}`
          : m.content,
    }));

    let toolCallCount = 0;
    let rounds = 0;

    // Tool-calling loop
    while (rounds < this.maxToolRounds) {
      rounds++;

      const response = await this.anthropic!.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 10000,
        thinking: {
          type: "enabled",
          budget_tokens: 4000,
        },
        system: systemPrompt,
        tools: REFINEMENT_TOOL_DEFINITIONS,
        messages: anthropicMessages,
      });

      // Check if Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        // Process all tool calls in this response
        const assistantContent = response.content;
        anthropicMessages.push({ role: "assistant", content: assistantContent });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of assistantContent) {
          if (block.type === "tool_use") {
            toolCallCount++;
            logger.debug({ tool: block.name, input: block.input }, "Refinement tool call");

            const result = await executeRefinementTool(
              block.name,
              block.input as Record<string, any>,
              ctx
            );

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // Feed tool results back
        anthropicMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Claude is done — extract text response (skip thinking blocks)
      let rawText = "";
      for (const block of response.content) {
        if (block.type === "text") {
          rawText = block.text;
          break;
        }
      }

      const parsed = parseResponse(rawText);

      // If the LLM claimed to edit but didn't include <summary> tags, nudge it once
      if (
        !parsed.suggestedEdit &&
        rounds < this.maxToolRounds &&
        /\b(corrected|revised|updated|rewritten|restructured|rewrote|changed|modified|added|removed|replaced|adjusted)\b/i.test(
          rawText
        )
      ) {
        logger.warn("Claude claimed edit without <summary> tags — nudging for actual output");
        anthropicMessages.push({ role: "assistant", content: rawText });
        anthropicMessages.push({
          role: "user",
          content:
            "You said you made changes but didn't include the rewritten summary. Please output the COMPLETE updated summary inside <summary> tags so the changes can be applied.",
        });
        continue;
      }

      logger.info(
        { toolCallCount, rounds, hasSuggestedEdit: !!parsed.suggestedEdit },
        "Refinement RLM completed (Claude)"
      );

      return { message: parsed.message, suggestedEdit: parsed.suggestedEdit, toolCallCount };
    }

    // Safety: if we hit max rounds, return whatever we have
    logger.warn({ rounds, toolCallCount }, "Refinement RLM hit max tool rounds");
    return {
      message: "I've gathered the information. Could you repeat your request?",
      suggestedEdit: null,
      toolCallCount,
    };
  }

  // --------------------------------------------------------------------------
  // Fallback: OpenAI GPT-5 single-shot (no tool loop)
  // --------------------------------------------------------------------------

  private async refineWithOpenAI(
    input: RefinementRLMInput,
    ctx: RefinementContext
  ): Promise<RefinementRLMResult> {
    if (!this.openai) {
      throw new Error("No LLM available — both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing");
    }

    // Pre-load all context since GPT-5 fallback uses single-shot (no tool loop)
    const [statsResult, activitiesResult, transcriptsResult, prefsResult] = await Promise.all([
      executeRefinementTool("get_timeline_stats", {}, ctx),
      executeRefinementTool("get_activities", { start: 0, end: 50 }, ctx),
      executeRefinementTool("get_transcripts", {}, ctx),
      executeRefinementTool("get_user_preferences", {}, ctx),
    ]);

    const contextBlock = `## Session Data (pre-loaded)
### Stats
${statsResult}

### Activities
${activitiesResult}

### Transcripts
${transcriptsResult}

### User Preferences
${prefsResult}`;

    const systemPrompt = `${buildSystemPrompt(input.currentSummary)}\n\n${contextBlock}`;

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...input.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const completion = await this.openai.chat.completions.create({
      messages: openaiMessages,
      model: "gpt-5",
      max_completion_tokens: 4000,
    });

    let rawText = completion.choices[0]?.message?.content || "";
    let parsed = parseResponse(rawText);

    // Nudge retry if LLM claimed edit without <summary> tags
    if (
      !parsed.suggestedEdit &&
      /\b(corrected|revised|updated|rewritten|restructured|rewrote|changed|modified|added|removed|replaced|adjusted)\b/i.test(
        rawText
      )
    ) {
      logger.warn("GPT-5 claimed edit without <summary> tags — nudging retry");
      const retryCompletion = await this.openai.chat.completions.create({
        messages: [
          ...openaiMessages,
          { role: "assistant" as const, content: rawText },
          {
            role: "user" as const,
            content:
              "You said you made changes but didn't include the rewritten summary. Please output the COMPLETE updated summary inside <summary> tags so the changes can be applied.",
          },
        ],
        model: "gpt-5",
        max_completion_tokens: 4000,
      });
      rawText = retryCompletion.choices[0]?.message?.content || rawText;
      parsed = parseResponse(rawText);
    }

    logger.info(
      { hasSuggestedEdit: !!parsed.suggestedEdit },
      "Refinement RLM completed (GPT-5 fallback)"
    );

    return { message: parsed.message, suggestedEdit: parsed.suggestedEdit, toolCallCount: 0 };
  }

  // --------------------------------------------------------------------------
  // Last resort: DeepSeek V3.2 (deepseek-chat) single-shot
  // --------------------------------------------------------------------------

  private async refineWithDeepSeek(input: RefinementRLMInput): Promise<RefinementRLMResult> {
    if (!this.deepseek) {
      throw new Error(
        "No LLM available — all providers (Anthropic, OpenAI, DeepSeek) failed or unconfigured"
      );
    }

    logger.info("⚠️⚠️ Refinement via DeepSeek V3.2 (last resort)");

    const systemPrompt = buildSystemPrompt(input.currentSummary);
    const deepseekMessages = [
      {
        role: "system" as const,
        content: systemPrompt + "\n\nIMPORTANT: Do NOT call any tools. Respond directly.",
      },
      ...input.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const completion = await this.deepseek.chat.completions.create({
      messages: deepseekMessages,
      model: "deepseek-chat",
      max_tokens: 4000,
    });

    let rawText = completion.choices[0]?.message?.content || "";
    let parsed = parseResponse(rawText);

    // Nudge retry if LLM claimed edit without <summary> tags
    if (
      !parsed.suggestedEdit &&
      /\b(corrected|revised|updated|rewritten|restructured|rewrote|changed|modified|added|removed|replaced|adjusted)\b/i.test(
        rawText
      )
    ) {
      logger.warn("DeepSeek claimed edit without <summary> tags — nudging retry");
      const retryCompletion = await this.deepseek.chat.completions.create({
        messages: [
          ...deepseekMessages,
          { role: "assistant" as const, content: rawText },
          {
            role: "user" as const,
            content:
              "You said you made changes but didn't include the rewritten summary. Please output the COMPLETE updated summary inside <summary> tags so the changes can be applied.",
          },
        ],
        model: "deepseek-chat",
        max_tokens: 4000,
      });
      rawText = retryCompletion.choices[0]?.message?.content || rawText;
      parsed = parseResponse(rawText);
    }

    return { message: parsed.message, suggestedEdit: parsed.suggestedEdit, toolCallCount: 0 };
  }
}

export const refinementRLMService = new RefinementRLMService();
