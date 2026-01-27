/**
 * Storyteller RLM Service
 *
 * Mini-RLM runtime for the Storyteller step.
 * Orchestrates tool execution based on LLM decisions.
 */

import Groq from "groq-sdk";
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

export interface StorytellerRLMInput {
  sessionId: string;
  timeline: Activity[];
  metadata: SessionMetadata;
  preferences: UserPreferences;
}

export interface StorytellerRLMResult {
  summary: string;
  toolCallCount: number;
  recursionDepth: number;
  executionTimeMs: number;
}

interface ToolCallResult {
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
  private groq: Groq;
  private maxIterations = 10; // Safety limit to prevent runaway tool calls

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Execute the Storyteller RLM to generate a session summary
   */
  async generateSummary(input: StorytellerRLMInput): Promise<StorytellerRLMResult> {
    const timer = createTimer("StorytellerRLM.generateSummary");

    // Initialize environment
    const environment = new StorytellerEnvironment(
      input.timeline,
      input.metadata,
      input.preferences
    );

    // Track execution state
    const toolCallHistory: ToolCallResult[] = [];
    let iterations = 0;
    let finalSummary = "";

    while (iterations < this.maxIterations) {
      iterations++;

      // Get LLM decision on next tool to call
      const llmResponse = await this.getLLMDecision(
        environment,
        toolCallHistory,
        iterations === 1 ? "start" : "continue"
      );

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
   * Get LLM decision on which tool to call next
   */
  private async getLLMDecision(
    _environment: StorytellerEnvironment,
    toolCallHistory: ToolCallResult[],
    state: string
  ): Promise<LLMResponse> {
    const systemPrompt = getStorytellerSystemPrompt();
    const userPrompt = getStorytellerUserPrompt(state, toolCallHistory);

    const completion = await this.groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "openai/gpt-oss-120b",
      temperature: 0.1, // Low temp for consistent tool selection
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    try {
      const parsed = JSON.parse(content) as LLMResponse;
      return parsed;
    } catch (e) {
      // If JSON parsing fails, try to extract summary from malformed response
      const summaryMatch = content.match(/"summary":\s*"([^"]+)"/);
      if (summaryMatch) {
        return {
          done: true,
          summary: summaryMatch[1].replace(/\\n/g, "\n"),
        };
      }
      throw new Error(`Failed to parse LLM response: ${content.substring(0, 500)}...`);
    }
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
  private calculateRecursionDepth(toolCallHistory: ToolCallResult[]): number {
    const summarizeChunkCalls = toolCallHistory.filter((t) => t.tool === "summarize_chunk");
    return summarizeChunkCalls.length;
  }

  /**
   * Fallback: Extract summary from tool history if LLM didn't complete
   */
  private extractFallbackSummary(toolCallHistory: ToolCallResult[]): string {
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
   * Check if RLM is available (Groq API key configured)
   */
  isAvailable(): boolean {
    return !!config.groq.apiKey;
  }
}

export const storytellerRLMService = new StorytellerRLMService();
