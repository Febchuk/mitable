/**
 * Storyteller RLM Service
 *
 * Mini-RLM runtime for the Storyteller step.
 * Orchestrates tool execution based on LLM decisions.
 *
 * Uses Claude Haiku 4.5 for cost-efficient agentic summarization.
 * Falls back to OpenAI GPT-5, then DeepSeek V3.2 (deepseek-chat).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../../../config";
import { StorytellerEnvironment, Activity, SessionMetadata } from "./storyteller-environment";
import { getToolByName } from "./storyteller-tools";
import { getStorytellerSystemPrompt, getStorytellerUserPrompt } from "./storyteller-rlm-prompts";
import { createTimer } from "../../../shared-infra/lib/sessionLogger.js";
import { createLogger } from "../../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "storyteller-rlm" });

export interface StorytellerRLMInput {
  sessionId: string;
  timeline: Activity[];
  fullTranscriptText?: string;
  metadata: SessionMetadata;
  userName?: string;
}

export interface StorytellerRLMResult {
  summary: string;
  toolCallCount: number;
  recursionDepth: number;
  executionTimeMs: number;
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
  summary?: string;
}

class StorytellerRLMService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;
  private baseMaxIterations = 25; // Base safety limit — scaled up for large sessions

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Storyteller RLM using Claude Haiku 4.5");
    } else {
      logger.warn("ANTHROPIC_API_KEY not set — will use GPT-5 fallback");
    }

    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info("GPT-5 fallback configured for Storyteller");
    } else {
      logger.warn("OPENAI_API_KEY not set");
    }

    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek V3.2 (deepseek-chat) configured for Storyteller (last resort)");
    }
  }

  /**
   * Execute the Storyteller RLM to generate a session summary
   */
  async generateSummary(input: StorytellerRLMInput): Promise<StorytellerRLMResult> {
    const timer = createTimer("StorytellerRLM.generateSummary");

    const environment = new StorytellerEnvironment(
      input.timeline,
      input.fullTranscriptText,
      input.metadata,
      input.userName
    );

    // Scale max iterations based on timeline size:
    // Small sessions (<50 activities): 10 iterations is plenty
    // Large sessions: need ~(chunks + 4) iterations for stats + chunk + summarize_each + merge
    const activityCount = input.timeline.length;
    const estimatedChunks = Math.ceil(activityCount / 100);
    const maxIterations = Math.min(50, Math.max(this.baseMaxIterations, estimatedChunks + 8));

    logger.info(
      { activityCount, estimatedChunks, maxIterations },
      "Storyteller RLM iteration budget"
    );

    // Build conversation — accumulated across iterations so LLM sees its own reasoning
    const systemPrompt = getStorytellerSystemPrompt(input.userName);
    const initialUserPrompt = getStorytellerUserPrompt("start", [], environment);

    // Claude uses separate system parameter; conversation only has user/assistant
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: initialUserPrompt },
    ];

    // Track execution state (toolCallHistory kept for fallback extraction)
    const toolCallHistory: ToolCallRecord[] = [];
    let iterations = 0;
    let finalSummary = "";

    while (iterations < maxIterations) {
      iterations++;

      // Get LLM decision using accumulated conversation
      const llmResponse = await this.getLLMDecision(systemPrompt, messages);

      // Append assistant response to conversation
      messages.push({ role: "assistant", content: JSON.stringify(llmResponse) });

      // Check if LLM is done
      if (llmResponse.done && llmResponse.summary) {
        finalSummary = llmResponse.summary;
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

        // Append tool result as user message so LLM sees it next iteration
        messages.push({
          role: "user",
          content: `Tool "${llmResponse.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step of your plan.`,
        });
      } else {
        break;
      }
    }

    if (!finalSummary && iterations >= maxIterations) {
      // Fallback: try to extract any summary from tool history
      logger.warn(
        { iterations, maxIterations, toolCallCount: toolCallHistory.length },
        "Storyteller RLM hit iteration limit — using fallback"
      );
      finalSummary = await this.extractFallbackSummary(toolCallHistory, environment);
    }

    const totalTime = timer.elapsed();

    return {
      summary: finalSummary || "Failed to generate summary",
      toolCallCount: toolCallHistory.length,
      recursionDepth: this.calculateRecursionDepth(toolCallHistory),
      executionTimeMs: totalTime,
    };
  }

  /**
   * Get LLM decision on which tool to call next.
   * Uses Claude Haiku 4.5 (primary) or GPT-5 (fallback).
   */
  private async getLLMDecision(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (this.anthropic) {
      // Retry transient errors (429 rate limit, 529 overloaded) up to 2 times
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await this.getLLMDecisionClaude(systemPrompt, messages);
          logger.info("✅ Storyteller decision via Claude Haiku 4.5");
          return result;
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
            const delayMs = (attempt + 1) * 5000; // 5s, 10s
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
      // All retries exhausted or non-retryable transient error — fall back
      if (this.openai) {
        try {
          const result = await this.getLLMDecisionOpenAI(systemPrompt, messages);
          logger.info("⚠️ Storyteller decision via GPT-5 (fallback)");
          return result;
        } catch (error) {
          logger.warn({ error: String(error) }, "OpenAI also failed — trying DeepSeek V3.2");
        }
      }
      if (this.deepseek) {
        const result = await this.getLLMDecisionDeepSeek(systemPrompt, messages);
        logger.info("⚠️⚠️ Storyteller decision via DeepSeek V3.2 (last resort)");
        return result;
      }
      throw new Error("No LLM available — all providers exhausted");
    }
    // No Anthropic configured — try OpenAI then DeepSeek
    if (this.openai) {
      try {
        return await this.getLLMDecisionOpenAI(systemPrompt, messages);
      } catch (error) {
        logger.warn({ error: String(error) }, "OpenAI failed — trying DeepSeek V3.2");
      }
    }
    if (this.deepseek) {
      return this.getLLMDecisionDeepSeek(systemPrompt, messages);
    }
    throw new Error("No LLM available — all providers unconfigured");
  }

  /**
   * Claude Haiku 4.5 — fast + cheap agentic path
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

    // Extract text content from response (skip thinking blocks)
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
      throw new Error(
        "No fallback LLM available — both ANTHROPIC_API_KEY and OPENAI_API_KEY are missing"
      );
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
      model: "gpt-5.4",
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
   * Parse LLM response into a tool call or final summary.
   * Handles markdown code fences and concatenated JSON objects
   * (e.g., model outputs {...}{...} instead of one object).
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
   * Extract the first complete JSON object from a string that may contain
   * concatenated JSON objects (e.g., {...}{...} from model batching).
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
   * Execute a specific tool with given parameters
   */
  private async executeTool(
    toolName: string,
    parameters: any,
    environment: StorytellerEnvironment
  ): Promise<any> {
    const tool = getToolByName(toolName);

    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Execute the tool
    const result = await tool.execute(parameters, environment);
    return result;
  }

  /**
   * Calculate recursion depth from tool call history
   */
  private calculateRecursionDepth(toolCallHistory: ToolCallRecord[]): number {
    const summarizeChunkCalls = toolCallHistory.filter((t) => t.tool === "summarize_chunk");
    return summarizeChunkCalls.length;
  }

  /**
   * Fallback: Extract summary from tool history if LLM didn't complete
   */
  private async extractFallbackSummary(
    toolCallHistory: ToolCallRecord[],
    environment: StorytellerEnvironment
  ): Promise<string> {
    // Look for merge_summaries result first
    const mergeResult = toolCallHistory
      .slice()
      .reverse()
      .find((t) => t.tool === "merge_summaries");

    if (mergeResult && typeof mergeResult.result === "string") {
      return mergeResult.result;
    }

    // Collect ALL chunk summaries and merge them
    const chunkSummaries = toolCallHistory
      .filter((t) => t.tool === "summarize_chunk" && t.result?.summary)
      .map((t) => t.result.summary as string);

    if (chunkSummaries.length > 1) {
      // Merge all available chunk summaries via the merge tool
      logger.info({ count: chunkSummaries.length }, "Fallback: merging all chunk summaries");
      try {
        const mergeTool = getToolByName("merge_summaries");
        if (mergeTool) {
          const merged = await mergeTool.execute({ summaries: chunkSummaries }, environment);
          if (typeof merged === "string" && merged.length > 0) {
            return merged;
          }
        }
      } catch (mergeErr) {
        logger.warn(
          { error: mergeErr instanceof Error ? mergeErr.message : String(mergeErr) },
          "Fallback merge failed, concatenating"
        );
      }
      // If merge tool fails, concatenate
      return chunkSummaries.join("\n\n");
    }

    if (chunkSummaries.length === 1) {
      return chunkSummaries[0];
    }

    return "Summary generation incomplete";
  }

  /**
   * Check if RLM is available
   */
  isAvailable(): boolean {
    return !!this.anthropic || !!this.openai;
  }
}

export const storytellerRLMService = new StorytellerRLMService();
