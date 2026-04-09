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
import { createTimer } from "../../domains/shared-infra/lib/sessionLogger.js";
import { parseJsonResponse } from "../../domains/shared-infra/lib/parse-json.js";

export interface ClassifierRLMInput {
  userId: string;
  sessionId: string;
  frameId: string;
  deltaDescription: string;
  sceneContext?: string | null; // Scene context from sensor (meeting participants, screen sharing, app environment)
  audioContext?: string; // Transcripts from ±5 seconds around screenshot
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
      sceneContext: input.sceneContext || undefined,
      audioContext: input.audioContext, // Audio transcripts from ±5 seconds around screenshot
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

    // Build conversation — accumulated across iterations so LLM sees its own reasoning
    const systemPrompt = getClassifierSystemPrompt();
    const initialUserPrompt = getClassifierUserPrompt(
      `Classify this screen change: "${input.deltaDescription}"`,
      []
    );
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: initialUserPrompt },
    ];

    // Track execution state
    let toolCallCount = 0;
    let iterations = 0;
    let finalClassification: ClassifierRLMResult | null = null;

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        // Get LLM decision using accumulated conversation
        const llmResponse = await this.getLLMDecision(messages);

        // Append assistant response to conversation
        messages.push({ role: "assistant", content: JSON.stringify(llmResponse) });

        // Check if LLM is done
        if (llmResponse.done && llmResponse.classification) {
          finalClassification = this.parseClassification(
            llmResponse.classification,
            toolCallCount,
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
          toolCallCount++;

          // Append tool result as user message so LLM sees it next iteration
          messages.push({
            role: "user",
            content: `Tool "${llmResponse.tool}" returned:\n${JSON.stringify(result, null, 2)}\n\nWhat should you do next? Or are you ready to return your final classification?`,
          });
        } else {
          break;
        }
      }

      if (!finalClassification) {
        finalClassification = this.createFallbackClassification(
          input.deltaDescription,
          toolCallCount,
          timer.elapsed()
        );
      }

      return finalClassification;
    } catch (error) {
      // Fallback on error
      return this.createFallbackClassification(
        input.deltaDescription,
        toolCallCount,
        timer.elapsed()
      );
    }
  }

  /**
   * Get LLM decision on what to do next
   */
  private async getLLMDecision(
    messages: Array<{ role: string; content: string }>
  ): Promise<LLMResponse> {
    const completion = await this.groq.chat.completions.create({
      messages: messages as any,
      model: "openai/gpt-oss-120b",
      temperature: 0.05, // Cognition not creativity - low temp for deterministic reasoning
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Classifier RLM");

    return parseJsonResponse(content);
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
