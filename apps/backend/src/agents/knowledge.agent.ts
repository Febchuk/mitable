import OpenAI from "openai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";
import { wrapWithWorkflowState } from "../tools/utils/workflow-wrapper";

/**
 * Knowledge Agent
 *
 * Searches and synthesizes information from the knowledge base (Slack + Notion).
 * Uses GPT-4 Turbo for superior reasoning and synthesis capabilities.
 *
 * Responsibilities:
 * - Documentation questions
 * - Policy/process questions
 * - Historical information ("What did we discuss last month?")
 * - Company-specific information
 *
 * Tools:
 * - search_knowledge: Hybrid search (Pinecone semantic + PostgreSQL keyword)
 * - detect_intent: Classify query type (company/product/operations/technical)
 * - apply_trust_ranking: Boost relevant sources based on intent
 * - parse_temporal_keywords: Parse "last week", "yesterday", etc.
 *
 * Services Used:
 * - searchService: Hybrid search (Pinecone + PostgreSQL)
 * - intentService: Intent classification
 * - trustRankingService: Result ranking
 * - embeddingService: Generate query embeddings
 *
 * Can be Called By:
 * - Orchestrator Agent (direct user queries)
 * - Visual Guidance Agent (for knowledge-grounded workflows)
 */
export class KnowledgeAgent extends BaseAgent {
  readonly name = "knowledge";
  private openai: OpenAI;
  private searchKnowledgeTool: SearchKnowledgeTool;

  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.searchKnowledgeTool = new SearchKnowledgeTool();
  }

  /**
   * Execute knowledge search and synthesis
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

      // Execute search using SearchKnowledgeTool
      const searchResult = await this.searchKnowledgeTool.execute(
        {
          query: lastUserMessage.content,
          topK: 10,
        },
        context
      );

      // Create base message with sources
      const baseMessage: TextMessage = {
        messageType: "text",
        content: searchResult.content,
        sources: searchResult.sources,
        streamable: true,
      };

      // Smart wrapper: automatically wraps if workflow state exists
      const finalMessage = wrapWithWorkflowState(baseMessage, context, "custom_question");

      // Yield complete chunk
      yield {
        type: "complete",
        messageType: finalMessage.messageType,
        content: finalMessage.content,
        sources: "sources" in finalMessage ? finalMessage.sources : undefined,
        cardData: "cardData" in finalMessage ? finalMessage.cardData : undefined,
        streamable: true,
      };
    } catch (error) {
      console.error("[KnowledgeAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in knowledge search",
      };
    }
  }

  /**
   * Direct search method for agent-to-agent communication
   * (Used by Visual Guidance Agent)
   */
  async search(query: string, context: ToolContext): Promise<TextMessage> {
    const result = await this.searchKnowledgeTool.execute(
      {
        query,
        topK: 10,
      },
      context
    );

    return {
      messageType: "text",
      content: result.content,
      sources: result.sources,
      streamable: true,
    };
  }
}
