/**
 * Day Analyzer RLM Service
 *
 * Full RLM engine for reconstructing a user's day into named activity blocks.
 * This is the heaviest computation in the cron pipeline (Layer 1).
 *
 * Input: All of a user's sessions for a day (classifier data, master stories, transcripts)
 * Output: Structured timeline of named work and meeting blocks
 *
 * Uses Claude Sonnet 4.5 with extended thinking (primary) or GPT-5 (fallback).
 * Follows the same RLM pattern as the Storyteller and Workstream engines.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../config";
import {
  DayAnalyzerEnvironment,
  DaySession,
  DayCapture,
  DayTranscript,
  DayMasterStory,
  DayAnalyzerUserProfile,
  EmittedBlock,
} from "./day-analyzer-environment";
import { getDayAnalyzerToolByName } from "./day-analyzer-tools";
import { getDayAnalyzerSystemPrompt, getDayAnalyzerUserPrompt } from "./day-analyzer-rlm-prompts";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "day-analyzer-rlm" });

export interface DayAnalyzerInput {
  date: Date;
  userProfile: DayAnalyzerUserProfile;
  sessions: DaySession[];
  captures: DayCapture[];
  transcripts: DayTranscript[];
  masterStories: DayMasterStory[];
  knownCustomers?: string[];
}

export interface DayAnalyzerResult {
  blocks: EmittedBlock[];
  daySummary: string;
  keyAccomplishments: string[];
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  totalActiveMinutes: number;
  workPercentage: number;
  meetingPercentage: number;
  appBreakdown: Array<{ app: string; minutes: number }>;
  categoryBreakdown: Array<{ category: string; percentage: number; minutes: number }>;
  toolCallCount: number;
  executionTimeMs: number;
  modelUsed: string;
}

interface ToolCallRecord {
  tool: string;
  result: any;
}

interface LLMResponse {
  tool?: string;
  parameters?: any;
  reasoning?: string;
  done?: boolean;
  daySummary?: string;
  keyAccomplishments?: string[];
}

class DayAnalyzerRLMService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;
  private maxIterations = 30; // Higher limit than storyteller — full day analysis needs more steps

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Day Analyzer RLM using Claude Sonnet 4.5 with extended thinking");
    } else {
      logger.warn("ANTHROPIC_API_KEY not set — will use GPT-5 fallback");
    }

    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info("GPT-5 fallback configured for Day Analyzer");
    } else {
      logger.warn("OPENAI_API_KEY not set");
    }

    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek V3.2 (deepseek-chat) configured for Day Analyzer (last resort)");
    }
  }

  /**
   * Execute the Day Analyzer RLM to reconstruct a user's day
   */
  async analyzeDay(input: DayAnalyzerInput): Promise<DayAnalyzerResult> {
    const startTime = Date.now();
    const modelUsed = this.anthropic ? "claude-sonnet-4-5-20250929" : "gpt-5";

    logger.info(
      {
        date: input.date.toISOString().split("T")[0],
        userId: input.userProfile.userId,
        sessionCount: input.sessions.length,
        captureCount: input.captures.length,
        transcriptCount: input.transcripts.length,
        storyCount: input.masterStories.length,
      },
      "Starting Day Analyzer RLM"
    );

    // Initialize environment
    const environment = new DayAnalyzerEnvironment(
      input.date,
      input.userProfile,
      input.sessions,
      input.captures,
      input.transcripts,
      input.masterStories
    );

    // Build conversation
    const systemPrompt = getDayAnalyzerSystemPrompt(input.knownCustomers || []);
    const initialUserPrompt = getDayAnalyzerUserPrompt([]);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: initialUserPrompt },
    ];

    const toolCallHistory: ToolCallRecord[] = [];
    let iterations = 0;
    let daySummary = "";
    let keyAccomplishments: string[] = [];

    while (iterations < this.maxIterations) {
      iterations++;

      try {
        const llmResponse = await this.getLLMDecision(systemPrompt, messages);

        // Append assistant response to conversation
        messages.push({ role: "assistant", content: JSON.stringify(llmResponse) });

        // Check if LLM is done
        if (llmResponse.done) {
          daySummary = llmResponse.daySummary || "";
          keyAccomplishments = llmResponse.keyAccomplishments || [];
          break;
        }

        // Execute the tool
        if (llmResponse.tool && llmResponse.parameters !== undefined) {
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
            { iteration: iterations, tool: llmResponse.tool, reasoning: llmResponse.reasoning },
            "Day Analyzer tool call"
          );

          // Append tool result as user message
          messages.push({
            role: "user",
            content: `Tool "${llmResponse.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step of your analysis.`,
          });
        } else {
          logger.warn({ iteration: iterations }, "Day Analyzer: no tool or done signal — breaking");
          break;
        }
      } catch (error) {
        logger.error(
          { iteration: iterations, error: String(error) },
          "Day Analyzer iteration error"
        );
        // Allow a few failures before giving up
        if (iterations >= this.maxIterations - 2) {
          break;
        }
      }
    }

    // Compute day stats from emitted blocks
    const dayStats = environment.computeDayStats();
    const blocks = environment.getEmittedBlocks();

    // Generate fallback summary if LLM didn't produce one
    if (!daySummary && blocks.length > 0) {
      daySummary = this.generateFallbackSummary(blocks, dayStats);
    }

    const executionTimeMs = Date.now() - startTime;

    logger.info(
      {
        userId: input.userProfile.userId,
        blockCount: blocks.length,
        workBlocks: dayStats.workBlockCount,
        meetingBlocks: dayStats.meetingBlockCount,
        totalActiveMinutes: dayStats.totalActiveMinutes,
        toolCalls: toolCallHistory.length,
        iterations,
        executionTimeMs,
        modelUsed,
      },
      "Day Analyzer RLM completed"
    );

    return {
      blocks,
      daySummary,
      keyAccomplishments,
      totalWorkMinutes: dayStats.totalWorkMinutes,
      totalMeetingMinutes: dayStats.totalMeetingMinutes,
      totalActiveMinutes: dayStats.totalActiveMinutes,
      workPercentage: dayStats.workPercentage,
      meetingPercentage: dayStats.meetingPercentage,
      appBreakdown: dayStats.appBreakdown,
      categoryBreakdown: dayStats.categoryBreakdown,
      toolCallCount: toolCallHistory.length,
      executionTimeMs,
      modelUsed,
    };
  }

  /**
   * Get LLM decision — Claude primary, GPT-5 fallback
   */
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
   * Claude Sonnet 4.5 with extended thinking
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
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 5000, // More thinking budget — day analysis requires deeper reasoning
      },
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
      throw new Error("Empty text response from Claude");
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
   * DeepSeek V3.2 (deepseek-chat) last resort — frontier model, non-thinking mode
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

  /**
   * Parse LLM response into a tool call or final result
   */
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

  /**
   * Extract first complete JSON object from potentially concatenated output
   */
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

  /**
   * Execute a Day Analyzer tool
   */
  private async executeTool(
    toolName: string,
    parameters: any,
    environment: DayAnalyzerEnvironment
  ): Promise<any> {
    const tool = getDayAnalyzerToolByName(toolName);

    if (!tool) {
      return { error: `Unknown tool: ${toolName}` };
    }

    return tool.execute(parameters, environment);
  }

  /**
   * Generate a basic summary if the LLM didn't produce one
   */
  private generateFallbackSummary(
    blocks: EmittedBlock[],
    stats: ReturnType<DayAnalyzerEnvironment["computeDayStats"]>
  ): string {
    const workBlocks = blocks.filter((b) => b.type === "work");
    const meetingBlocks = blocks.filter((b) => b.type === "meeting");

    const parts: string[] = [];

    if (stats.totalActiveMinutes > 0) {
      parts.push(`${Math.round((stats.totalActiveMinutes / 60) * 10) / 10}h tracked`);
    }
    if (workBlocks.length > 0) {
      parts.push(`${workBlocks.length} work block${workBlocks.length > 1 ? "s" : ""}`);
    }
    if (meetingBlocks.length > 0) {
      parts.push(`${meetingBlocks.length} meeting${meetingBlocks.length > 1 ? "s" : ""}`);
    }

    const topActivities = blocks
      .slice(0, 3)
      .map((b) => b.name)
      .join(", ");

    return `Day included ${parts.join(", ")}. Key activities: ${topActivities}.`;
  }

  /**
   * Check if RLM is available
   */
  isAvailable(): boolean {
    return !!this.anthropic || !!this.openai;
  }
}

export const dayAnalyzerRLMService = new DayAnalyzerRLMService();
