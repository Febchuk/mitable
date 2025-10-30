import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { RespondTextTool } from "../tools/respond-text.tool";
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
  private respondTextTool: RespondTextTool;

  constructor() {
    super();
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
    this.respondTextTool = new RespondTextTool();
  }

  /**
   * Execute text response generation using Gemini Flash
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

      // Build conversation context
      const conversationContext = context.conversationHistory
        .slice(-5) // Last 5 messages for context
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");

      const prompt = `${systemPrompt}\n\nConversation:\n${conversationContext}\n\nProvide a brief, helpful response.`;

      // Generate response with Gemini Flash
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

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
        streamable: true,
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
