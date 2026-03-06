import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { TextResponseAgent } from "../agents/text-response.agent";
import { KnowledgeAgent } from "../agents/knowledge.agent";
import { VisualGuidanceAgent } from "../agents/visual-guidance.agent";
import { BaseAgent } from "../agents/base.agent";
import { guideGenerationService } from "./guideGeneration.service";
import { logger } from "../lib/logger.js";
import { graphContextBuilderService } from "./graph/graph-context-builder.service";

/**
 * Intent classification types
 */
interface Intent {
  type: "general_chat" | "knowledge_search" | "workflow_start" | "open_domain_qa";
  confidence: number;
  reasoning?: string;
}

/**
 * Orchestrator Service
 *
 * The central router for the multi-agent architecture.
 * Routes incoming requests to specialized agents based on intent and metadata.
 *
 * Architecture:
 * - Receives all user messages from API layer
 * - Classifies intent using Gemini Flash (cheap, fast)
 * - Routes to appropriate specialized agent
 * - Pre-loads workflow state for all agents
 * - Forwards agent responses directly (no paraphrasing)
 *
 * Routing Strategy:
 * 1. Metadata-driven (deterministic):
 *    - workflowAction = "progress_step" -> VisualGuidanceAgent
 *    - workflowAction = "exit_workflow" -> TextResponseAgent
 *
 * 2. Intent-based (LLM classification):
 *    - "workflow_start" + screenshot -> VisualGuidanceAgent
 *    - "knowledge_search" -> KnowledgeAgent
 *    - "general_chat" -> TextResponseAgent
 *
 * Agents:
 * - TextResponseAgent: Simple responses (Gemini Flash)
 * - KnowledgeAgent: Search & synthesis (GPT-4)
 * - VisualGuidanceAgent: UI workflows (GPT-4 + Vision)
 *
 * Cost Savings:
 * - Gemini Flash for routing: 10x cheaper than GPT-4
 * - Gemini Flash for text responses (60% of requests): 10x cheaper
 * - Total estimated savings: 40-60%
 */
export class OrchestratorService {
  private gemini: GoogleGenerativeAI;
  private textAgent: TextResponseAgent;
  private knowledgeAgent: KnowledgeAgent;
  private visualGuidanceAgent: VisualGuidanceAgent;

  constructor() {
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);

    // Initialize agents (order matters for dependencies)
    this.textAgent = new TextResponseAgent();
    this.knowledgeAgent = new KnowledgeAgent();

    // Visual Guidance Agent depends on Knowledge Agent and Text Response Agent
    this.visualGuidanceAgent = new VisualGuidanceAgent(this.knowledgeAgent, this.textAgent);
  }

  /**
   * Main entry point for all user messages
   */
  async *processMessage(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Step 1: Pre-load workflow state for all agents (gracefully handle errors)
      let workflowState = null;
      try {
        workflowState = await guideGenerationService.retrieveLatestSolutionObject(
          context.conversationId
        );
      } catch (error) {
        // Workflow state retrieval failed - not critical, continue without it
        logger.warn(
          { err: error instanceof Error ? error : new Error(String(error)) },
          "[Orchestrator] Workflow state retrieval failed (non-critical)"
        );
      }
      context.workflowState = workflowState || undefined;

      // Step 1b: Pre-load graph context for personalization and retrieval shaping.
      // Failures are non-blocking to keep chat availability stable.
      if (config.graph.enabled) {
        try {
          context.graphContext = await graphContextBuilderService.buildForUser(
            context.userId,
            context.organizationId
          );
        } catch (error) {
          logger.warn(
            { err: error instanceof Error ? error : new Error(String(error)) },
            "[Orchestrator] Graph context prefetch failed (non-critical)"
          );
        }
      }

      logger.info(
        {
          conversationId: context.conversationId,
          screenshotCount: context.screenshots?.length || 0,
          hasWorkflowState: !!workflowState,
          hasGraphContext: !!context.graphContext,
          workflowAction: context.metadata?.workflowAction,
        },
        "[Orchestrator] Processing message"
      );

      // Step 2: Metadata-driven routing (deterministic)
      if (context.metadata?.workflowAction === "progress_step") {
        logger.info("[Orchestrator] Routing: metadata → VisualGuidanceAgent (progress_step)");
        yield* this.visualGuidanceAgent.execute(context);
        return;
      }

      if (context.metadata?.workflowAction === "custom_question") {
        logger.info("[Orchestrator] Routing: metadata → VisualGuidanceAgent (custom_question)");
        yield* this.visualGuidanceAgent.execute(context);
        return;
      }

      if (context.metadata?.workflowAction === "exit_workflow") {
        logger.info("[Orchestrator] Routing: metadata → TextResponseAgent (exit_workflow)");
        yield* this.textAgent.execute(context);
        return;
      }

      // Step 3: Intent classification (LLM-based)
      const intent = await this.classifyIntent(context);

      logger.info(
        { type: intent.type, confidence: intent.confidence },
        "[Orchestrator] Intent classified"
      );

      // Step 4: Route based on intent
      const agent = await this.routeByIntent(intent, context);

      logger.info({ agent: agent.name }, "[Orchestrator] Routing: intent → Agent");

      // Step 6: Execute agent and forward responses
      yield* agent.execute(context);
    } catch (error) {
      logger.error({ err: error }, "[Orchestrator] Error");
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown orchestration error",
      };
    }
  }

  /**
   * Parse intent from JSON response with safe fallback to RAG
   */
  private parseIntentJSON(text: string): Intent {
    try {
      // Strip markdown code blocks if present (Gemini sometimes wraps in ```json)
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        // Remove opening ```json or ``` and closing ```
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
      }

      const json = JSON.parse(cleaned);
      const validIntents = [
        "general_chat",
        "knowledge_search",
        "workflow_start",
        "expert_request",
        "open_domain_qa",
      ];
      const isValid = validIntents.includes(json.type);

      return {
        type: isValid ? json.type : "general_chat",
        confidence: Math.max(0, Math.min(1, Number(json.confidence) || 0.5)),
      } as Intent;
    } catch (error) {
      logger.warn({ err: error }, "[Orchestrator] JSON parse failed, defaulting to general_chat");
      // Safe fallback to general chat on parse error
      return { type: "general_chat", confidence: 0.55 };
    }
  }

  /**
   * Classify user intent using Gemini Flash (cheap, fast)
   */
  private async classifyIntent(context: ToolContext): Promise<Intent> {
    try {
      // Get last user message
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .pop();

      if (!lastUserMessage) {
        return { type: "general_chat", confidence: 1.0 };
      }

      const userMessage = lastUserMessage.content;

      const model = this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Classify into ONE intent:
- "general_chat": Simple conversation, greetings, thanks, acknowledgments, clarifications
- "knowledge_search": Questions about company docs, policies, discussions, meetings, decisions
- "workflow_start": User wants step-by-step guidance to complete a task in an app
- "expert_request": User wants to find a colleague who knows about a topic

Rules:
- Use "general_chat" for conversational messages, greetings, follow-ups that don't need search
- Use "knowledge_search" ONLY when user is clearly asking for information/facts from docs/history
- Use "workflow_start" when user wants step-by-step UI guidance (screenshot helps)
- Use "expert_request" when user explicitly wants to find/talk to someone

User: ${JSON.stringify(userMessage)}
screenshot_available: ${context.screenshots && context.screenshots.length > 0 ? "yes" : "no"}

Return STRICT JSON only:
{"type":"<intent>","confidence":0.0-1.0}`;

      const result = await model.generateContent(prompt);
      let intent = this.parseIntentJSON(result.response.text().trim());

      logger.debug({ intent }, "[Orchestrator] Gemini classified");

      // Safety: prefer RAG if "workflow_start" without screenshot and low confidence
      if (
        intent.type === "workflow_start" &&
        (!context.screenshots || context.screenshots.length === 0) &&
        intent.confidence < 0.8
      ) {
        logger.info(
          { originalIntent: intent.type, newIntent: "knowledge_search" },
          "[Orchestrator] Downgrading workflow_start → knowledge_search (no screenshot + low confidence)"
        );
        intent = { type: "knowledge_search", confidence: 0.6 };
      }

      return intent;
    } catch (error) {
      logger.error({ err: error }, "[Orchestrator] Intent classification error");
      // Safe fallback to general chat on error
      return { type: "general_chat", confidence: 0.5 };
    }
  }

  /**
   * Route to appropriate agent based on intent
   */
  private async routeByIntent(intent: Intent, context: ToolContext): Promise<BaseAgent> {
    // Workflow start requires screenshot
    if (intent.type === "workflow_start" && context.screenshots && context.screenshots.length > 0) {
      return this.visualGuidanceAgent;
    }

    // Knowledge search
    if (intent.type === "knowledge_search") {
      return this.knowledgeAgent;
    }

    // Default: general chat
    return this.textAgent;
  }
}
