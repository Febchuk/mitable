import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
// import { RespondTextTool } from "../tools/respond-text.tool"; // Unused - commented out
import { wrapWithWorkflowState } from "../tools/utils/workflow-wrapper";

/**
 * Text Response Agent
 *
 * Handles simple conversational responses without external data.
 * Uses Gemini 1.5 Flash for cost-effective text generation (10x cheaper than GPT-4).
 *
 * Responsibilities:
 * - General questions without knowledge base needs
 * - Acknowledgments ("Got it", "Sounds good")
 * - Clarifications
 * - Conceptual explanations (no external data)
 * - Workflow conceptual questions ("Why do I need this step?")
 *
 * When to Use:
 * - No screenshot required
 * - No knowledge search required
 * - No expert matching required
 * - Simple Q&A, chitchat
 *
 * Cost Savings: ~60% of requests, 10x cheaper = **6x overall cost reduction**
 */
export class TextResponseAgent extends BaseAgent {
  readonly name = "text-response";
  private gemini: GoogleGenerativeAI;
  // private respondTextTool: RespondTextTool; // Unused - agent uses Gemini directly

  constructor() {
    super();
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
    // this.respondTextTool = new RespondTextTool(); // Unused - commented out
  }

  /**
   * Execute text response generation using Gemini Flash
   *
   * This agent can operate in two modes:
   * 1. Regular conversation mode (no workflow context)
   * 2. Workflow-aware mode (uses context.workflowState for enriched responses)
   *
   * When context.workflowState exists, the agent has access to:
   * - Current task goal and explanation
   * - Current step description
   * - Supporting documentation that grounded the workflow
   * This allows answering workflow questions without re-searching the knowledge base.
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Get the last user message
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .pop();

      if (!lastUserMessage) {
        yield {
          type: "error",
          error: "No user message found in conversation history",
        };
        return;
      }

      // Use Gemini Flash for cost-effective generation
      const model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

      // Simple system context
      const systemPrompt = `You are an experienced employee assistant helping new hires ramp up quickly at their company.
You have deep product knowledge and guide people through their work like an expert colleague who's always available to help.

Be DIRECT and FACTUAL. Answer the question with facts, then stop. You're a colleague, not a professor analyzing their work.`;

      let prompt: string;

      // Check if we're answering a question during an active workflow
      // Only use workflow context if workflow is ACTIVE (not paused)
      if (context.workflowState && context.workflowState.status === "active") {
        console.log("[TextResponseAgent] Using workflow context for enhanced response");

        const currentStep = context.workflowState.stepList[context.workflowState.currentStepIndex];

        // Extract supporting documentation for context (limit to top 5 for token efficiency)
        const supportingContext = context.workflowState.supportingData
          .slice(0, 5)
          .map((doc) => {
            const snippet = doc.snippet || "";
            const truncated = snippet.length > 300 ? snippet.substring(0, 300) + "..." : snippet;
            return `[${doc.title || "Unknown"}]: ${truncated}`;
          })
          .join("\n\n");

        // Build recent conversation context (last 5 messages)
        const conversationContext = context.conversationHistory
          .slice(-5)
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n");

        // Build workflow-enriched prompt
        prompt = `${systemPrompt}

ACTIVE WORKFLOW CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task Goal: ${context.workflowState.solution}

Why This Approach: ${context.workflowState.solutionExplanation}

Current Step: Step ${context.workflowState.currentStepIndex + 1}/${context.workflowState.stepList.length}
Description: ${currentStep.description}

Relevant Company Documentation:
${supportingContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recent Conversation:
${conversationContext}

User Question: ${lastUserMessage.content}

Answer the question using the workflow context above. Be concise and helpful. Reference the documentation or workflow explanation when relevant.`;
      } else {
        console.log("[TextResponseAgent] Using regular conversation mode (no workflow context)");

        // Build conversation context (regular mode)
        const conversationContext = context.conversationHistory
          .slice(-5) // Last 5 messages for context
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n");

        prompt = `${systemPrompt}\n\nConversation:\n${conversationContext}\n\nProvide a brief, helpful response.`;
      }

      // Generate response with Gemini Flash
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      console.log("[TextResponseAgent] Response generated:", {
        length: text.length,
        hasWorkflowContext: !!context.workflowState,
      });

      // Create base message
      const baseMessage: TextMessage = {
        messageType: "text",
        content: text,
        streamable: true,
      };

      // Smart wrapper: automatically wraps if workflow state exists
      const finalMessage = wrapWithWorkflowState(baseMessage, context, "custom_question");

      // Yield complete chunk
      yield {
        type: "complete",
        messageType: finalMessage.messageType,
        content: finalMessage.content,
        cardData: "cardData" in finalMessage ? finalMessage.cardData : undefined,
      };
    } catch (error) {
      console.error("[TextResponseAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in text response generation",
      };
    }
  }
}
