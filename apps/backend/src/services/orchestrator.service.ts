import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { TextResponseAgent } from "../agents/text-response.agent";
import { KnowledgeAgent } from "../agents/knowledge.agent";
import { VisualGuidanceAgent } from "../agents/visual-guidance.agent";
import { ExpertMatchingAgent } from "../agents/expert-matching.agent";
import { BaseAgent } from "../agents/base.agent";
import { guideGenerationService } from "./guideGeneration.service";

/**
 * Intent classification types
 */
interface Intent {
  type: "general_chat" | "knowledge_search" | "workflow_start" | "expert_request";
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
 *    - workflowAction = "progress_step" ’ VisualGuidanceAgent
 *    - workflowAction = "exit_workflow" ’ TextResponseAgent
 *
 * 2. Intent-based (LLM classification):
 *    - "workflow_start" + screenshot ’ VisualGuidanceAgent
 *    - "knowledge_search" ’ KnowledgeAgent
 *    - "expert_request" ’ ExpertMatchingAgent
 *    - "general_chat" ’ TextResponseAgent
 *
 * 3. Fallback handling:
 *    - Knowledge search returns no results ’ ExpertMatchingAgent
 *
 * Agents:
 * - TextResponseAgent: Simple responses (Gemini Flash)
 * - KnowledgeAgent: Search & synthesis (GPT-4)
 * - VisualGuidanceAgent: UI workflows (GPT-4 + Vision)
 * - ExpertMatchingAgent: Find colleagues (GPT-3.5)
 *
 * Cost Savings:
 * - Gemini Flash for routing: 10x cheaper than GPT-4
 * - Gemini Flash for text responses (60% of requests): 10x cheaper
 * - GPT-3.5 for expert matching (5% of requests): 3x cheaper
 * - Total estimated savings: 40-60%
 */
export class OrchestratorService {
  private gemini: GoogleGenerativeAI;
  private textAgent: TextResponseAgent;
  private knowledgeAgent: KnowledgeAgent;
  private visualGuidanceAgent: VisualGuidanceAgent;
  private expertMatchingAgent: ExpertMatchingAgent;

  constructor() {
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);

    // Initialize agents
    this.textAgent = new TextResponseAgent();
    this.knowledgeAgent = new KnowledgeAgent();
    this.expertMatchingAgent = new ExpertMatchingAgent();

    // Visual Guidance Agent depends on Knowledge Agent
    this.visualGuidanceAgent = new VisualGuidanceAgent(this.knowledgeAgent);
  }

  /**
   * Main entry point for all user messages
   */
  async *processMessage(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Step 1: Pre-load workflow state for all agents
      const workflowState = await guideGenerationService.retrieveLatestSolutionObject(
        context.conversationId
      );
      context.workflowState = workflowState || undefined;

      console.log("[Orchestrator] Processing message:", {
        conversationId: context.conversationId,
        hasScreenshot: !!context.screenshot,
        hasWorkflowState: !!workflowState,
        workflowAction: context.metadata?.workflowAction,
      });

      // Step 2: Metadata-driven routing (deterministic)
      if (context.metadata?.workflowAction === "progress_step") {
        console.log("[Orchestrator] Routing: metadata ’ VisualGuidanceAgent (progress_step)");
        yield* this.visualGuidanceAgent.execute(context);
        return;
      }

      if (context.metadata?.workflowAction === "exit_workflow") {
        console.log("[Orchestrator] Routing: metadata ’ TextResponseAgent (exit_workflow)");
        yield* this.textAgent.execute(context);
        return;
      }

      // Step 3: Intent classification (LLM-based)
      const intent = await this.classifyIntent(context);

      console.log("[Orchestrator] Intent classified:", {
        type: intent.type,
        confidence: intent.confidence,
      });

      // Step 4: Route based on intent
      const agent = await this.routeByIntent(intent, context);

      console.log("[Orchestrator] Routing: intent ’ Agent:", agent.name);

      // Step 5: Execute agent and forward responses
      yield* agent.execute(context);
    } catch (error) {
      console.error("[Orchestrator] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown orchestration error",
      };
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

      // Use Gemini Flash for classification
      const model = this.gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Classify the following user message into ONE of these intents:

1. "general_chat" - Simple conversational response (greetings, acknowledgments, clarifications)
2. "knowledge_search" - User asking for company information, documentation, policies, processes
3. "workflow_start" - User wants step-by-step UI guidance (must have "How do I..." or similar)
4. "expert_request" - User explicitly asking for colleague help ("Who can help with...")

User message: "${lastUserMessage.content}"
Screenshot available: ${context.screenshot ? "yes" : "no"}

Respond with ONLY the intent type and confidence (0.0-1.0), nothing else.
Format: <intent>|<confidence>
Example: knowledge_search|0.85`;

      const result = await model.generateContent(prompt);
      const response = result.response.text().trim();

      // Parse response
      const [intentType, confidenceStr] = response.split("|");
      const confidence = parseFloat(confidenceStr || "0.5");

      // Validate intent type
      const validIntents = ["general_chat", "knowledge_search", "workflow_start", "expert_request"];
      const normalizedIntent = intentType.trim().toLowerCase();

      if (!validIntents.includes(normalizedIntent)) {
        console.warn("[Orchestrator] Invalid intent from Gemini:", intentType);
        return { type: "general_chat", confidence: 0.5 };
      }

      return {
        type: normalizedIntent as Intent["type"],
        confidence: Math.max(0, Math.min(1, confidence)),
      };
    } catch (error) {
      console.error("[Orchestrator] Intent classification error:", error);
      // Default to general chat on error
      return { type: "general_chat", confidence: 0.5 };
    }
  }

  /**
   * Route to appropriate agent based on intent
   */
  private async routeByIntent(intent: Intent, context: ToolContext): Promise<BaseAgent> {
    // Workflow start requires screenshot
    if (intent.type === "workflow_start" && context.screenshot) {
      return this.visualGuidanceAgent;
    }

    // Knowledge search
    if (intent.type === "knowledge_search") {
      return this.knowledgeAgent;
    }

    // Expert request
    if (intent.type === "expert_request") {
      return this.expertMatchingAgent;
    }

    // Default: general chat
    return this.textAgent;
  }
}
