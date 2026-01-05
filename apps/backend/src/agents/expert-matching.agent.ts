// import OpenAI from "openai"; // Unused - commented out
// import { config } from "../config"; // Unused - commented out
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { FindExpertTool } from "../tools/find-expert.tool";

/**
 * Expert Matching Agent
 *
 * Matches users with expert colleagues using weighted scoring algorithm.
 * Uses GPT-3.5 Turbo for cost-effective expert matching (3x cheaper than GPT-4).
 *
 * Responsibilities:
 * - "Who can help with..." questions
 * - Expert recommendations
 * - Fallback when knowledge search fails
 *
 * Tools:
 * - find_expert_colleague: Score and rank experts
 *
 * Scoring Algorithm:
 * - Expertise similarity (40%): Cosine similarity of embeddings
 * - Performance (30%): Response rate + helpfulness rating
 * - Availability (30%): Online status
 *
 * Services Used:
 * - expertMatchingService: Scoring algorithm
 * - embeddingService: Generate topic embeddings
 *
 * Returns:
 * - ExpertsMessage (NOT wrapped by smart wrapper - has its own cardData)
 * - Triggers Nudge Window with expert recommendations
 *
 * Cost Savings: 3x cheaper than GPT-4 for matching logic
 */
export class ExpertMatchingAgent extends BaseAgent {
  readonly name = "expert-matching";
  // private openai: OpenAI; // Unused - kept for future expert summary synthesis
  private findExpertTool: FindExpertTool;

  constructor() {
    super();
    // this.openai = new OpenAI({ apiKey: config.openai.apiKey }); // Unused - commented out
    this.findExpertTool = new FindExpertTool();
  }

  /**
   * Execute expert matching
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

      // Execute expert matching using FindExpertTool
      const expertResult = await this.findExpertTool.execute(
        {
          query: lastUserMessage.content,
          topK: 3, // Top 3 experts
        },
        context
      );

      // FindExpertTool returns ExpertsMessage directly
      // No smart wrapper needed - experts have their own cardData structure

      // Yield complete chunk
      yield {
        type: "complete",
        messageType: expertResult.messageType,
        content: expertResult.content,
        cardData: expertResult.cardData,
        windowTrigger: expertResult.triggerWindow,
      };
    } catch (error) {
      console.error("[ExpertMatchingAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in expert matching",
      };
    }
  }
}
