/**
 * Classifier RLM Service
 *
 * The BRAIN of the sessions monitoring system.
 * Uses iterative reasoning with 3 focused tools to classify screen changes.
 */

import Groq from "groq-sdk";
import { config } from "../../config";
import {
  ClassifierEnvironment,
  ClassifierContext,
  BatchContext,
} from "./classifier-environment";
import { getToolByName } from "./classifier-tools";
import {
  getClassifierSystemPrompt,
  getClassifierUserPrompt,
  getBatchClassifierSystemPrompt,
  getBatchClassifierUserPrompt,
} from "./classifier-rlm-prompts";
import { createTimer } from "../../lib/sessionLogger";

export interface ClassifierRLMInput {
  userId: string;
  sessionId: string;
  frameId: string;
  deltaDescription: string;
  windowInfo?: {
    appName: string;
    windowTitle: string;
  };
  intervalEvidence?: {
    keyboardEventCount: number;
    copyCount: number;
    pasteCount: number;
    cutCount: number;
    mouseClickCount: number;
    mouseScrollCount: number;
  };
  previousDelta?: string;
  timeElapsedSec?: number;
  recentHistory?: string[];
  userPersona?: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  };
}

export interface ClassifierEvent {
  type: "navigation" | "composition" | "paste" | "view" | "edit";
  verb: string;
  object: string;
  via?: string;
}

export interface ClassifierRLMResult {
  activity: string;
  action_type: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING";
  confidence: number;
  is_continuation: boolean;
  events: ClassifierEvent[];
  entities: {
    people: string[];
    systems: string[];
  };
  metrics: {
    messages_composed: number;
    links_opened: number;
    pastes_performed: number;
  };
  toolCallCount: number;
  executionTimeMs: number;
  reasoning?: string; // Explanation of how classification was derived
  toolCallHistory?: ToolCallResult[]; // Full tool call history with reasoning
}

export interface BatchClassifierRLMInput {
  userId: string;
  sessionId: string;
  batchStartTime: number;
  batchEndTime: number;
  captures: Array<{
    frameId: string;
    windowInfo: {
      windowSourceId: string;
      appName: string;
      windowTitle: string;
    };
    capturedAt: number;
    timestampISO: string;
    sequenceNumber: number;
    hasPreviousFrame: boolean;
    deltaDescription?: string;
    deltaChanged?: boolean;
  }>;
  activityEvents: Array<{
    type: "keyboard" | "copy" | "paste" | "cut" | "click" | "scroll";
    timestampUnix: number;
    timestampISO: string;
  }>;
  activityTimeline: Array<{
    sequenceNumber: number;
    capturedAt: Date;
    activityDescription: string;
    classifierData?: any;
    windows: Array<{ appName: string; windowTitle: string }>;
  }>;
  userPersona?: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  };
  sessionGoal?: string;
}

export interface BatchClassifierRLMResult {
  activity: string;
  action_type: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING";
  confidence: number;
  is_continuation: boolean;
  events?: ClassifierEvent[];
  entities?: {
    people: string[];
    systems: string[];
  };
  metrics?: {
    messages_composed: number;
    links_opened: number;
    pastes_performed: number;
  };
  toolCallCount: number;
  executionTimeMs: number;
  reasoning: string; // Explanation of how classification was derived
  toolCallHistory: ToolCallResult[]; // Full tool call history with reasoning traces
}

interface ToolCallResult {
  tool: string;
  result: any;
  reasoning?: string; // Why this tool was called
  howResultDerived?: string; // How the result was derived from inputs
}

interface LLMResponse {
  tool?: string;
  parameters?: any;
  reasoning?: string;
  done?: boolean;
  classification?: any;
}

class ClassifierRLMService {
  private groq: Groq;
  private maxIterations = 10; // Safety limit - should only need 3-4

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Execute the Classifier RLM to generate an activity classification
   */
  async classify(input: ClassifierRLMInput): Promise<ClassifierRLMResult> {
    const timer = createTimer("ClassifierRLM.classify");

    // Build context for environment
    const context: ClassifierContext = {
      userId: input.userId,
      sessionId: input.sessionId,
      frameId: input.frameId,
      currentDelta: input.deltaDescription,
      windowInfo: input.windowInfo,
      intervalEvidence: input.intervalEvidence,
      previousDeltas: input.previousDelta
        ? [{ description: input.previousDelta, timestamp: new Date().toISOString() }]
        : [],
      recentHistory: input.recentHistory || [],
      timeElapsedSec: input.timeElapsedSec,
      userPersona: input.userPersona,
    };

    // Initialize environment
    const environment = new ClassifierEnvironment(context);

    // Track execution state
    const toolCallHistory: ToolCallResult[] = [];
    let iterations = 0;
    let finalClassification: ClassifierRLMResult | null = null;

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        // Get LLM decision on next tool to call
        const llmResponse = await this.getLLMDecision(toolCallHistory, input.deltaDescription);

        // Check if LLM is done
        if (llmResponse.done && llmResponse.classification) {
          finalClassification = this.parseClassification(
            llmResponse.classification,
            toolCallHistory.length,
            timer.elapsed()
          );
          break;
        }

        // Execute tool if specified
        if (llmResponse.tool) {
          const tool = getToolByName(llmResponse.tool);

          if (!tool) {
            break;
          }

          const result = await tool.execute(llmResponse.parameters || {}, environment);

          // Store tool result with reasoning trace
          toolCallHistory.push({
            tool: llmResponse.tool,
            result,
            reasoning: llmResponse.reasoning, // Why this tool was called
            howResultDerived: this.extractHowResultDerived(result), // How result was derived
          });
        } else {
          break;
        }
      }

      if (!finalClassification) {
        finalClassification = this.createFallbackClassification(
          input.deltaDescription,
          toolCallHistory.length,
          timer.elapsed()
        );
      }

      // Add reasoning and tool call history to result
      finalClassification.reasoning = this.buildReasoningSummary(toolCallHistory);
      finalClassification.toolCallHistory = toolCallHistory;

      return finalClassification;
    } catch (error) {
      // Fallback on error
      return this.createFallbackClassification(
        input.deltaDescription,
        toolCallHistory.length,
        timer.elapsed()
      );
    }
  }

  /**
   * Get LLM decision on what to do next
   */
  private async getLLMDecision(
    previousResults: ToolCallResult[],
    deltaDescription: string
  ): Promise<LLMResponse> {
    const systemPrompt = getClassifierSystemPrompt();
    const userPrompt = getClassifierUserPrompt(
      `Classify this screen change: "${deltaDescription}"`,
      previousResults
    );

    const completion = await this.groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "openai/gpt-oss-120b",
      temperature: 0.05, // Cognition not creativity - low temp for deterministic reasoning
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Classifier RLM");

    return JSON.parse(content);
  }

  /**
   * Parse final classification from LLM response
   */
  private parseClassification(
    classification: any,
    toolCallCount: number,
    executionTimeMs: number
  ): ClassifierRLMResult {
    return {
      activity: classification.activity || "Unknown activity",
      action_type: classification.action_type || "VIEWING",
      confidence: classification.confidence || 0.5,
      is_continuation: classification.is_continuation || false,
      events: classification.events || [],
      entities: classification.entities || { people: [], systems: [] },
      metrics: classification.metrics || {
        messages_composed: 0,
        links_opened: 0,
        pastes_performed: 0,
      },
      toolCallCount,
      executionTimeMs,
    };
  }

  /**
   * Create fallback classification when RLM fails
   */
  private createFallbackClassification(
    deltaDescription: string,
    toolCallCount: number,
    executionTimeMs: number
  ): ClassifierRLMResult {
    return {
      activity: deltaDescription,
      action_type: "VIEWING",
      confidence: 0.3,
      is_continuation: false,
      events: [],
      entities: { people: [], systems: [] },
      metrics: {
        messages_composed: 0,
        links_opened: 0,
        pastes_performed: 0,
      },
      toolCallCount,
      executionTimeMs,
      reasoning: "Fallback classification - RLM processing failed",
    };
  }

  /**
   * Extract how result was derived from tool result
   */
  private extractHowResultDerived(result: any): string {
    if (result?.reasoning) {
      return result.reasoning;
    }
    if (typeof result === "string") {
      return result;
    }
    if (result?.summary) {
      return result.summary;
    }
    return "Result derived from tool execution";
  }

  /**
   * Build reasoning summary from tool call history
   */
  private buildReasoningSummary(toolCallHistory: ToolCallResult[]): string {
    if (toolCallHistory.length === 0) {
      return "No tools called - using fallback classification";
    }

    const summaries = toolCallHistory.map((call, index) => {
      const reasoning = call.reasoning || "No reasoning provided";
      const howDerived = call.howResultDerived || "Result derived from tool execution";
      return `Step ${index + 1}: Called ${call.tool} - ${reasoning}. Result: ${howDerived}`;
    });

    return summaries.join(" → ");
  }

  /**
   * Classify a batch of screenshots (60-second window)
   * Returns SINGLE classification for the entire batch
   */
  async classifyBatch(input: BatchClassifierRLMInput): Promise<BatchClassifierRLMResult> {
    const timer = createTimer("ClassifierRLM.classifyBatch");

    // Build batch context for environment
    const batchContext: BatchContext = {
      userId: input.userId,
      sessionId: input.sessionId,
      batchStartTime: input.batchStartTime,
      batchEndTime: input.batchEndTime,
      captures: input.captures,
      activityEvents: input.activityEvents,
      activityTimeline: input.activityTimeline,
      userPersona: input.userPersona,
      sessionGoal: input.sessionGoal,
    };

    // Initialize environment with batch context
    const environment = new ClassifierEnvironment(batchContext);

    // Track execution state
    const toolCallHistory: ToolCallResult[] = [];
    let iterations = 0;
    let finalClassification: BatchClassifierRLMResult | null = null;

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        // Get LLM decision on next tool to call
        const llmResponse = await this.getBatchLLMDecision(
          toolCallHistory,
          input.captures.length,
          input.activityEvents.length
        );

        // Check if LLM is done
        if (llmResponse.done && llmResponse.classification) {
          finalClassification = this.parseBatchClassification(
            llmResponse.classification,
            toolCallHistory.length,
            timer.elapsed(),
            toolCallHistory
          );
          break;
        }

        // Execute tool if specified
        if (llmResponse.tool) {
          const tool = getToolByName(llmResponse.tool);

          if (!tool) {
            break;
          }

          const result = await tool.execute(llmResponse.parameters || {}, environment);

          // Cache results for tools that other tools depend on
          if (llmResponse.tool === "interpret_visual_changes") {
            environment.setCache("visual_interpretations", result);
          } else if (llmResponse.tool === "analyze_screenshot_relationships") {
            environment.setCache("screenshot_relationships", result);
          }

          // Store tool result with reasoning trace
          toolCallHistory.push({
            tool: llmResponse.tool,
            result,
            reasoning: llmResponse.reasoning,
            howResultDerived: this.extractHowResultDerived(result),
          });
        } else {
          break;
        }
      }

      if (!finalClassification) {
        finalClassification = this.createFallbackBatchClassification(
          input.captures.length,
          toolCallHistory.length,
          timer.elapsed(),
          toolCallHistory
        );
      }

      return finalClassification;
    } catch (error) {
      // Fallback on error
      return this.createFallbackBatchClassification(
        input.captures.length,
        toolCallHistory.length,
        timer.elapsed(),
        toolCallHistory
      );
    }
  }

  /**
   * Get LLM decision for batch processing
   */
  private async getBatchLLMDecision(
    previousResults: ToolCallResult[],
    captureCount: number,
    activityEventCount: number
  ): Promise<LLMResponse> {
    const systemPrompt = getBatchClassifierSystemPrompt();
    const userPrompt = getBatchClassifierUserPrompt(previousResults, captureCount, activityEventCount);

    const completion = await this.groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "openai/gpt-oss-120b",
      temperature: 0.05,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Batch Classifier RLM");

    return JSON.parse(content);
  }

  /**
   * Parse final batch classification from LLM response
   */
  private parseBatchClassification(
    classification: any,
    toolCallCount: number,
    executionTimeMs: number,
    toolCallHistory: ToolCallResult[]
  ): BatchClassifierRLMResult {
    return {
      activity: classification.activity || "Unknown batch activity",
      action_type: classification.action_type || "VIEWING",
      confidence: classification.confidence || 0.5,
      is_continuation: classification.is_continuation || false,
      events: classification.events || [],
      entities: classification.entities || { people: [], systems: [] },
      metrics: classification.metrics || {
        messages_composed: 0,
        links_opened: 0,
        pastes_performed: 0,
      },
      toolCallCount,
      executionTimeMs,
      reasoning: classification.reasoning || this.buildReasoningSummary(toolCallHistory),
      toolCallHistory,
    };
  }

  /**
   * Create fallback batch classification when RLM fails
   */
  private createFallbackBatchClassification(
    captureCount: number,
    toolCallCount: number,
    executionTimeMs: number,
    toolCallHistory: ToolCallResult[]
  ): BatchClassifierRLMResult {
    return {
      activity: `Processed ${captureCount} screenshots in batch`,
      action_type: "VIEWING",
      confidence: 0.3,
      is_continuation: false,
      events: [],
      entities: { people: [], systems: [] },
      metrics: {
        messages_composed: 0,
        links_opened: 0,
        pastes_performed: 0,
      },
      toolCallCount,
      executionTimeMs,
      reasoning: "Fallback batch classification - RLM processing failed",
      toolCallHistory,
    };
  }
}

export const classifierRLMService = new ClassifierRLMService();
