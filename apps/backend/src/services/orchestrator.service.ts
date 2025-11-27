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
  type:
    | "general_chat"
    | "knowledge_search"
    | "workflow_start"
    | "expert_request"
    | "open_domain_qa";
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
 *    - workflowAction = "progress_step" � VisualGuidanceAgent
 *    - workflowAction = "exit_workflow" � TextResponseAgent
 *
 * 2. Intent-based (LLM classification):
 *    - "workflow_start" + screenshot � VisualGuidanceAgent
 *    - "knowledge_search" � KnowledgeAgent
 *    - "expert_request" � ExpertMatchingAgent
 *    - "general_chat" � TextResponseAgent
 *
 * 3. Fallback handling:
 *    - Knowledge search returns no results � ExpertMatchingAgent
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

    // Initialize agents (order matters for dependencies)
    this.textAgent = new TextResponseAgent();
    this.knowledgeAgent = new KnowledgeAgent();
    this.expertMatchingAgent = new ExpertMatchingAgent();

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
        console.log(
          "[Orchestrator] Workflow state retrieval failed (non-critical):",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
      context.workflowState = workflowState || undefined;

      console.log("[Orchestrator] Processing message:", {
        conversationId: context.conversationId,
        screenshotCount: context.screenshots?.length || 0,
        hasWorkflowState: !!workflowState,
        workflowAction: context.metadata?.workflowAction,
      });

      // Step 2: Metadata-driven routing (deterministic)
      if (context.metadata?.workflowAction === "progress_step") {
        console.log("[Orchestrator] Routing: metadata � VisualGuidanceAgent (progress_step)");
        yield* this.visualGuidanceAgent.execute(context);
        return;
      }

      if (context.metadata?.workflowAction === "custom_question") {
        console.log("[Orchestrator] Routing: metadata � VisualGuidanceAgent (custom_question)");
        yield* this.visualGuidanceAgent.execute(context);
        return;
      }

      if (context.metadata?.workflowAction === "exit_workflow") {
        console.log("[Orchestrator] Routing: metadata � TextResponseAgent (exit_workflow)");
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

      console.log("[Orchestrator] Routing: intent � Agent:", agent.name);

      // Step 6: Execute agent and forward responses
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
   * Heuristic shortcut for obvious knowledge queries
   * Catches common RAG patterns before calling LLM
   */
  private heuristicRAG(msg: string): { type?: Intent["type"]; confidence?: number } {
    const KNOWLEDGE_HINT =
      /\b(what|where|when|how|why|policy|policies|doc|docs|documentation|handbook|guide|SOP|PRD|spec|requirement|requirements|meeting|notes|recap|decision|roadmap|update|discuss|discussed|conversation|thread|channel|slack|notion|wiki|announcement|setup|set up|configure|config|environment|install|deploy)\b/i;

    if (KNOWLEDGE_HINT.test(msg)) {
      return { type: "knowledge_search", confidence: 0.9 };
    }
    return {};
  }

  /**
   * Check if prior assistant message was from KnowledgeAgent (has sources)
   */
  private priorWasRAG(ctx: ToolContext): boolean {
    const lastAssistant = ctx.conversationHistory
      .slice()
      .reverse()
      .find((m) => m.role === "assistant");

    // KnowledgeAgent always includes Sources section
    return lastAssistant?.content.includes("Sources:") || false;
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
      console.warn("[Orchestrator] JSON parse failed, defaulting to general_chat:", error);
      // Safe fallback to general chat on parse error
      return { type: "general_chat", confidence: 0.55 };
    }
  }

  /**
   * Classify user intent using Gemini Flash (cheap, fast)
   * Enhanced with RAG-biased heuristics and safer parsing
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

      // (0) Short greeting check - handle simple greetings with text agent
      const isGreeting =
        /^(hi|hello|hey|good morning|good afternoon|good evening|greetings|yo|sup|what's up|whats up)[\s!.?]*$/i.test(
          userMessage.trim()
        );
      if (isGreeting) {
        console.log("[Orchestrator] Simple greeting → general_chat");
        return { type: "general_chat", confidence: 1.0 };
      }

      // Has org hints → route to knowledge search
      const ORG_HINT =
        /\b(slack|notion|policy|policies|handbook|doc|docs|documentation|meeting|notes|recap|decision|roadmap|update|channel|thread|conversation|discuss|discussed|talk|talked|mention|mentioned|said|internal|wiki|sop|prd|spec|org|organization|company|team|we|our|us|locally|setup|set up|environment|configure|config|install|deploy|january|february|march|april|may|june|july|august|september|october|november|december|today|yesterday|week|month|year|ago|recent|latest)\b/i;

      if (ORG_HINT.test(userMessage)) {
        console.log("[Orchestrator] Has org hints → knowledge_search");
        return { type: "knowledge_search", confidence: 0.9 };
      }

      // (1) RAG heuristic shortcut - catch obvious knowledge queries
      const heuristic = this.heuristicRAG(userMessage);
      if (heuristic.type && (heuristic.confidence ?? 0) >= 0.85) {
        console.log("[Orchestrator] Heuristic match → knowledge_search");
        return heuristic as Intent;
      }

      // (3) RAG carry-over - keep short follow-ups on RAG path
      const wordCount = userMessage.trim().split(/\s+/).length;
      if (wordCount <= 6 && this.priorWasRAG(context)) {
        console.log("[Orchestrator] Short follow-up after RAG → knowledge_search");
        return { type: "knowledge_search", confidence: 0.8 };
      }

      // (2) Model with strict JSON and RAG-biased prompt
      const model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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

      console.log("[Orchestrator] Gemini classified:", intent);

      // (4) Safety: prefer RAG if "workflow_start" without screenshot and low confidence
      if (
        intent.type === "workflow_start" &&
        (!context.screenshots || context.screenshots.length === 0) &&
        intent.confidence < 0.8
      ) {
        console.log(
          "[Orchestrator] Downgrading workflow_start → knowledge_search (no screenshot + low confidence)"
        );
        intent = { type: "knowledge_search", confidence: 0.6 };
      }

      // (4b) Post-classification guard: if model chose knowledge_search but message has no org hints, use open_domain_qa
      if (intent.type === "knowledge_search" && !ORG_HINT.test(userMessage)) {
        console.log("[Orchestrator] No org hints detected → downgrade to open_domain_qa");
        intent = {
          type: "open_domain_qa",
          confidence: Math.min(0.9, Math.max(0.6, intent.confidence)),
        } as Intent;
      }

      return intent;
    } catch (error) {
      console.error("[Orchestrator] Intent classification error:", error);
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

    // Expert request
    if (intent.type === "expert_request") {
      return this.expertMatchingAgent;
    }

    // Default: general chat
    return this.textAgent;
  }
}
