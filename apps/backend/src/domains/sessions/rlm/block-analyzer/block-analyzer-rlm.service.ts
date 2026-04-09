/**
 * Block Analyzer RLM Service
 *
 * Full RLM engine for classifying a single session's activities into
 * named work and meeting blocks with rich topic, subscriber, and
 * category attribution.
 *
 * Runs at session end (after storyteller completes) and replaces the
 * lightweight classifySession → materializeSession chain.
 *
 * Input: Session captures, transcripts, master story, known customers
 * Output: Structured activity blocks + session-level metrics
 *
 * Uses Claude Haiku 4.5 (primary),
 * GPT-5 (fallback), DeepSeek V3.2 (last resort).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../../../config";
import {
  BlockAnalyzerEnvironment,
  SessionMeta,
  SessionCapture,
  SessionTranscript,
  SessionMasterStory,
  BlockAnalyzerUserProfile,
  EmittedBlock,
  SubscriberHistoryEntry,
} from "./block-analyzer-environment";
import { getBlockAnalyzerToolByName } from "./block-analyzer-tools";
import {
  getBlockAnalyzerSystemPrompt,
  getBlockAnalyzerUserPrompt,
} from "./block-analyzer-rlm-prompts";
import { createLogger } from "../../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "block-analyzer-rlm" });

export interface BlockAnalyzerInput {
  session: SessionMeta;
  userProfile: BlockAnalyzerUserProfile;
  captures: SessionCapture[];
  transcripts: SessionTranscript[];
  masterStory: SessionMasterStory | null;
  knownCustomers?: string[];
  orgName?: string | null;
  subscriberHistory?: SubscriberHistoryEntry[];
}

export interface BlockAnalyzerResult {
  blocks: EmittedBlock[];
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  totalActiveMinutes: number;
  workPercentage: number;
  meetingPercentage: number;
  appBreakdown: Array<{ app: string; minutes: number }>;
  categoryBreakdown: Array<{ category: string; percentage: number; minutes: number }>;
  topicBreakdown: Array<{ topicName: string; percentage: number; minutes: number }>;
  subscriberBreakdown: Array<{ subscriberName: string; percentage: number; minutes: number }>;
  toolCallCount: number;
  executionTimeMs: number;
  modelUsed: string;
}

interface LLMResponse {
  tool?: string;
  parameters?: any;
  reasoning?: string;
  done?: boolean;
}

interface ToolCallRecord {
  tool: string;
  result: any;
}

class BlockAnalyzerRLMService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;
  private baseMaxIterations = 25; // Base safety limit — scaled up for large sessions

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Block Analyzer RLM using Claude Haiku 4.5");
    } else {
      logger.warn("ANTHROPIC_API_KEY not set — will use GPT-5 fallback");
    }

    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info("GPT-5 fallback configured for Block Analyzer");
    } else {
      logger.warn("OPENAI_API_KEY not set");
    }

    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek V3.2 configured for Block Analyzer (last resort)");
    }
  }

  /**
   * Execute the Block Analyzer RLM to classify a session's activities
   */
  async analyzeSession(input: BlockAnalyzerInput): Promise<BlockAnalyzerResult> {
    const startTime = Date.now();
    const modelUsed = this.anthropic
      ? "claude-haiku-4-5-20251001"
      : this.openai
        ? "gpt-5"
        : "deepseek-chat";

    logger.info(
      {
        sessionId: input.session.sessionId,
        userId: input.userProfile.userId,
        captureCount: input.captures.length,
        transcriptCount: input.transcripts.length,
        hasMasterStory: !!input.masterStory,
        durationMinutes: input.session.durationMinutes,
      },
      "Starting Block Analyzer RLM"
    );

    // Initialize environment
    const environment = new BlockAnalyzerEnvironment(
      input.session,
      input.userProfile,
      input.captures,
      input.transcripts,
      input.masterStory,
      input.subscriberHistory || []
    );

    // Scale max iterations based on capture count:
    // Captures are paginated at 30/page. LLM needs: overview + master story + page reads + emit calls.
    // For 861 captures (~29 pages), it might read 15-20 pages + emit 5-10 blocks.
    const capturePages = Math.ceil(input.captures.length / 30);
    const maxIterations = Math.min(60, Math.max(this.baseMaxIterations, capturePages + 15));

    logger.info(
      { captureCount: input.captures.length, capturePages, maxIterations },
      "Block Analyzer iteration budget"
    );

    // Build conversation
    const systemPrompt = getBlockAnalyzerSystemPrompt(input.knownCustomers || [], input.orgName);
    const initialUserPrompt = getBlockAnalyzerUserPrompt();

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: initialUserPrompt },
    ];

    const toolCallHistory: ToolCallRecord[] = [];
    let iterations = 0;
    let consecutiveBadResponses = 0;
    let nudgeCount = 0;

    while (iterations < maxIterations) {
      iterations++;

      try {
        const llmResponse = await this.getLLMDecision(systemPrompt, messages);

        // Append assistant response to conversation
        messages.push({ role: "assistant", content: JSON.stringify(llmResponse) });

        // Check if LLM is done
        if (llmResponse.done) {
          break;
        }

        // Execute the tool
        if (llmResponse.tool && llmResponse.parameters !== undefined) {
          consecutiveBadResponses = 0;

          const toolResult = await this.executeTool(
            llmResponse.tool,
            llmResponse.parameters,
            environment
          );

          toolCallHistory.push({
            tool: llmResponse.tool,
            result: toolResult,
          });

          logger.debug(
            {
              iteration: iterations,
              tool: llmResponse.tool,
              reasoning: llmResponse.reasoning,
            },
            "Block Analyzer tool call"
          );

          // Track read vs emit calls to detect when LLM is stuck reading
          const emitCalls = toolCallHistory.filter(
            (t) => t.tool === "emit_work_block" || t.tool === "emit_meeting_block"
          ).length;
          const readCalls = toolCallHistory.filter(
            (t) => t.tool === "get_captures" || t.tool === "get_captures_by_time"
          ).length;
          const shouldNudge = readCalls >= 8 && emitCalls === 0 && nudgeCount < 3;

          const nudge = shouldNudge
            ? `\n\nIMPORTANT: You have read ${readCalls} pages of captures but have not emitted any blocks yet. The master story already provides the high-level structure — you do NOT need to read every capture page. Start emitting blocks NOW using emit_work_block or emit_meeting_block. Use the master story for the activity structure and the captures you've already read for precise time boundaries.`
            : "";
          if (shouldNudge) nudgeCount++;

          // Append tool result as user message
          messages.push({
            role: "user",
            content: `Tool "${llmResponse.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step of your analysis.${nudge}`,
          });
        } else {
          consecutiveBadResponses++;
          logger.warn(
            { iteration: iterations, consecutiveBadResponses },
            "Block Analyzer: no tool or done signal"
          );

          if (consecutiveBadResponses >= 3) {
            logger.warn(
              { iteration: iterations },
              "Block Analyzer: 3 consecutive bad responses — breaking"
            );
            break;
          }

          // Nudge the LLM to emit blocks instead of hard-breaking
          messages.push({
            role: "user",
            content:
              'Your response was not a valid tool call or done signal. You must respond with a JSON object containing either a tool call or { "done": true }. If you have enough context from the master story and captures, start emitting blocks now with emit_work_block.',
          });
        }
      } catch (error) {
        logger.error(
          { iteration: iterations, error: String(error) },
          "Block Analyzer iteration error"
        );
        if (iterations >= maxIterations - 2) {
          break;
        }
      }
    }

    // Compute stats from emitted blocks
    const sessionStats = environment.computeSessionStats();
    const blocks = environment.getEmittedBlocks();

    const executionTimeMs = Date.now() - startTime;

    logger.info(
      {
        sessionId: input.session.sessionId,
        blockCount: blocks.length,
        workBlocks: sessionStats.workBlockCount,
        meetingBlocks: sessionStats.meetingBlockCount,
        totalActiveMinutes: sessionStats.totalActiveMinutes,
        toolCalls: toolCallHistory.length,
        iterations,
        executionTimeMs,
        modelUsed,
      },
      "Block Analyzer RLM completed"
    );

    return {
      blocks,
      totalWorkMinutes: sessionStats.totalWorkMinutes,
      totalMeetingMinutes: sessionStats.totalMeetingMinutes,
      totalActiveMinutes: sessionStats.totalActiveMinutes,
      workPercentage: sessionStats.workPercentage,
      meetingPercentage: sessionStats.meetingPercentage,
      appBreakdown: sessionStats.appBreakdown,
      categoryBreakdown: sessionStats.categoryBreakdown,
      topicBreakdown: sessionStats.topicBreakdown,
      subscriberBreakdown: sessionStats.subscriberBreakdown,
      toolCallCount: toolCallHistory.length,
      executionTimeMs,
      modelUsed,
    };
  }

  // ──────────────────────────────────────────────
  // LLM Decision — Haiku 4.5 → GPT-5 → DeepSeek
  // ──────────────────────────────────────────────

  private async getLLMDecision(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (this.anthropic) {
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await this.getLLMDecisionClaude(systemPrompt, messages);
        } catch (error) {
          const errStr = String(error);
          const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
          if (isFatal) {
            logger.error(
              { error: errStr },
              "Claude auth/billing error — permanently disabling for this process"
            );
            this.anthropic = null;
            break;
          }
          const isRetryable = /429|rate.?limit|529|overloaded/i.test(errStr);
          if (isRetryable && attempt < MAX_RETRIES) {
            const delayMs = (attempt + 1) * 5000;
            logger.warn(
              { error: errStr, attempt: attempt + 1, delayMs },
              `Claude rate-limited/overloaded — retrying in ${delayMs / 1000}s`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          logger.warn(
            { error: errStr, attempt: attempt + 1 },
            "Claude call failed — falling back to GPT-5 for this call only"
          );
          break;
        }
      }
    }
    if (this.openai) {
      try {
        return await this.getLLMDecisionOpenAI(systemPrompt, messages);
      } catch (error) {
        logger.warn({ error: String(error) }, "OpenAI also failed — trying DeepSeek V3.2");
      }
    }
    if (this.deepseek) {
      return this.getLLMDecisionDeepSeek(systemPrompt, messages);
    }
    throw new Error("No LLM available — all providers exhausted");
  }

  /**
   * Claude Haiku 4.5 — fast + cheap, no thinking
   */
  private async getLLMDecisionClaude(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    const claudeMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await this.anthropic!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system:
        systemPrompt +
        "\n\nIMPORTANT: Always respond with a valid JSON object. No markdown, no code fences, just raw JSON.",
      messages: claudeMessages,
    });

    let textContent = "";
    for (const block of response.content) {
      if (block.type === "text") {
        textContent = block.text;
      }
    }

    if (!textContent) {
      throw new Error("Empty text response from Claude Haiku");
    }

    return this.parseToolCallResponse(textContent);
  }

  /**
   * OpenAI GPT-5 fallback
   */
  private async getLLMDecisionOpenAI(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error("No LLM available — both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing");
    }

    const openaiMessages = [
      {
        role: "system" as const,
        content:
          systemPrompt +
          "\n\nIMPORTANT: Always respond with a valid JSON object. No markdown, no code fences, just raw JSON.",
      },
      ...messages,
    ];

    const completion = await this.openai.chat.completions.create({
      messages: openaiMessages as any,
      model: "gpt-5",
      max_completion_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from GPT-5");
    }

    return this.parseToolCallResponse(content);
  }

  /**
   * DeepSeek V3.2 (deepseek-chat) last resort
   */
  private async getLLMDecisionDeepSeek(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (!this.deepseek) {
      throw new Error("DeepSeek client not configured");
    }

    const deepseekMessages = [
      {
        role: "system" as const,
        content:
          systemPrompt +
          "\n\nIMPORTANT: Always respond with a valid JSON object. No markdown, no code fences, just raw JSON.",
      },
      ...messages,
    ];

    const completion = await this.deepseek.chat.completions.create({
      messages: deepseekMessages as any,
      model: "deepseek-chat",
      max_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from DeepSeek V3.2");
    }

    return this.parseToolCallResponse(content);
  }

  // ──────────────────────────────────────────────
  // Parsing & Tool Execution
  // ──────────────────────────────────────────────

  private parseToolCallResponse(raw: string): LLMResponse {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned) as LLMResponse;
    } catch {
      const firstObj = this.extractFirstJsonObject(cleaned);
      if (firstObj) {
        return firstObj;
      }
      throw new Error(`Failed to parse LLM response: ${cleaned.substring(0, 200)}`);
    }
  }

  private extractFirstJsonObject(text: string): LLMResponse | null {
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            return JSON.parse(text.substring(start, i + 1)) as LLMResponse;
          } catch {
            start = -1;
          }
        }
      }
    }
    return null;
  }

  private async executeTool(
    toolName: string,
    parameters: any,
    environment: BlockAnalyzerEnvironment
  ): Promise<any> {
    const tool = getBlockAnalyzerToolByName(toolName);

    if (!tool) {
      return { error: `Unknown tool: ${toolName}` };
    }

    return tool.execute(parameters, environment);
  }

  /**
   * Check if RLM is available
   */
  isAvailable(): boolean {
    return !!this.anthropic || !!this.openai || !!this.deepseek;
  }
}

export const blockAnalyzerRLMService = new BlockAnalyzerRLMService();
