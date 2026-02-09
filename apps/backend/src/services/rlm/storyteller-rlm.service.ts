/**
 * Storyteller RLM Service
 *
 * Mini-RLM runtime for the Storyteller step.
 * Orchestrates tool execution based on LLM decisions.
 *
 * Uses Claude Sonnet 4.5 with extended thinking for high-quality,
 * deliberate summarization. Falls back to DeepSeek R1 (reasoning model) if Anthropic fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../config";
import {
  StorytellerEnvironment,
  Activity,
  SessionMetadata,
  UserPreferences,
} from "./storyteller-environment";
import { getToolByName } from "./storyteller-tools";
import { getStorytellerSystemPrompt, getStorytellerUserPrompt } from "./storyteller-rlm-prompts";
import { createTimer } from "../../lib/sessionLogger";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "storyteller-rlm" });

export interface StorytellerRLMInput {
  sessionId: string;
  timeline: Activity[];
  fullTranscriptText?: string; // Complete session audio transcripts for narrative enrichment
  metadata: SessionMetadata;
  preferences: UserPreferences;
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
  private deepseek: OpenAI | null = null; // DeepSeek R1 fallback (OpenAI-compatible)
  private maxIterations = 10; // Safety limit to prevent runaway tool calls

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Storyteller RLM using Claude Sonnet 4.5 with extended thinking");
    } else {
      logger.warn("ANTHROPIC_API_KEY not set — will use DeepSeek R1 fallback");
    }

    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek R1 fallback configured for Storyteller");
    } else {
      logger.warn("DEEPSEEK_API_KEY not set — no fallback available for Storyteller");
    }
  }

  /**
   * Execute the Storyteller RLM to generate a session summary
   */
  async generateSummary(input: StorytellerRLMInput): Promise<StorytellerRLMResult> {
    const timer = createTimer("StorytellerRLM.generateSummary");

    // Initialize environment
    const environment = new StorytellerEnvironment(
      input.timeline,
      input.fullTranscriptText, // Full audio context for narrative richness
      input.metadata,
      input.preferences
    );

    // Build conversation — accumulated across iterations so LLM sees its own reasoning
    const systemPrompt = getStorytellerSystemPrompt();
    const initialUserPrompt = getStorytellerUserPrompt("start", [], environment);

    // Claude uses separate system parameter; conversation only has user/assistant
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: initialUserPrompt },
    ];

    // Track execution state (toolCallHistory kept for fallback extraction)
    const toolCallHistory: ToolCallRecord[] = [];
    let iterations = 0;
    let finalSummary = "";

    while (iterations < this.maxIterations) {
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

    if (!finalSummary && iterations >= this.maxIterations) {
      // Fallback: try to extract any summary from tool history
      finalSummary = this.extractFallbackSummary(toolCallHistory);
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
   * Uses Claude Sonnet 4.5 with extended thinking (primary) or DeepSeek R1 (fallback).
   */
  private async getLLMDecision(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (this.anthropic) {
      try {
        const result = await this.getLLMDecisionClaude(systemPrompt, messages);
        logger.info("✅ Storyteller decision via Claude Sonnet 4.5");
        return result;
      } catch (error) {
        logger.warn(
          { error: String(error) },
          "Claude call failed at runtime — falling back to DeepSeek R1"
        );
        // Disable Anthropic for the rest of this process lifetime to avoid repeated failures
        this.anthropic = null;
        const result = await this.getLLMDecisionDeepSeek(systemPrompt, messages);
        logger.info("⚠️ Storyteller decision via DeepSeek R1 (fallback)");
        return result;
      }
    }
    logger.info("⚠️ Storyteller decision via DeepSeek R1 (no Anthropic key)");
    return this.getLLMDecisionDeepSeek(systemPrompt, messages);
  }

  /**
   * Claude Sonnet 4.5 with extended thinking — primary path
   */
  private async getLLMDecisionClaude(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    // Append JSON instruction to the last user message context
    const claudeMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await this.anthropic!.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16000, // High limit to accommodate thinking + response
      thinking: {
        type: "enabled",
        budget_tokens: 4000, // Let Claude think through the tool selection / summary
      },
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
   * DeepSeek R1 fallback — reasoning model with built-in chain-of-thought
   */
  private async getLLMDecisionDeepSeek(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<LLMResponse> {
    if (!this.deepseek) {
      throw new Error(
        "No fallback LLM available — both ANTHROPIC_API_KEY and DEEPSEEK_API_KEY are missing"
      );
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
      model: "deepseek-reasoner",
      max_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from DeepSeek R1");
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
  private extractFallbackSummary(toolCallHistory: ToolCallRecord[]): string {
    // Look for merge_summaries result
    const mergeResult = toolCallHistory
      .slice()
      .reverse()
      .find((t) => t.tool === "merge_summaries");

    if (mergeResult && typeof mergeResult.result === "string") {
      return mergeResult.result;
    }

    // Look for any summarize_chunk result
    const summarizeResult = toolCallHistory
      .slice()
      .reverse()
      .find((t) => t.tool === "summarize_chunk");

    if (summarizeResult && summarizeResult.result?.summary) {
      return summarizeResult.result.summary;
    }

    return "Summary generation incomplete";
  }

  /**
   * Check if RLM is available
   */
  isAvailable(): boolean {
    return !!this.anthropic || !!this.deepseek;
  }
}

export const storytellerRLMService = new StorytellerRLMService();
