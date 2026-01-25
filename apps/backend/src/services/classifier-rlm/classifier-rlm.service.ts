/**
 * Classifier RLM Service
 *
 * The BRAIN of the sessions monitoring system.
 * Uses iterative reasoning with 3 focused tools to classify screen changes.
 */

import Groq from "groq-sdk";
import { config } from "../../config";
import { ClassifierEnvironment, ClassifierContext } from "./classifier-environment";
import { getToolByName } from "./classifier-tools";
import { getClassifierSystemPrompt, getClassifierUserPrompt } from "./classifier-rlm-prompts";
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

          toolCallHistory.push({
            tool: llmResponse.tool,
            result,
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
    };
  }
}

export const classifierRLMService = new ClassifierRLMService();
