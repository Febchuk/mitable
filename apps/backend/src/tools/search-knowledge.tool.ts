import { BaseTool, ToolContext, ToolResult, ToolParameters } from "./base.tool.js";
import { embeddingService } from "../services/embedding.service.js";
import { vectorService } from "../services/vector.service.js";
import { intentService } from "../services/intent.service.js";
import { trustRankingService } from "../services/trust-ranking.service.js";

/**
 * SearchKnowledgeTool
 *
 * Phase 2 of the agentic system - Intelligent knowledge search with RAG + trust-based ranking
 *
 * This tool enables the AI to search the company's knowledge base
 * (Slack messages + Notion pages) stored in Pinecone and retrieve
 * relevant context to answer employee questions.
 *
 * Features:
 * - Intent detection: Classifies queries into company/product/operations/technical/greeting/general
 * - Trust-based ranking: Boosts relevant sources based on query type
 *   • Company questions → Boost Notion/Google Drive 2.5x
 *   • Product questions → Boost PRDs/roadmaps 2.0x
 *   • Operations questions → Boost Slack conversations 2.5x
 *   • Technical questions → Boost codebase 3.0x, docs 1.5x
 * - Date-aware: Disables ranking for timeline/history queries
 *
 * Flow:
 * 1. Detect user intent (company/product/operations/technical/greeting/general)
 * 2. Generate embedding for the question
 * 3. Query Pinecone for similar vectors
 * 4. Apply trust-based ranking to boost relevant sources
 * 5. Return top K most relevant results
 * 6. AI uses this context to generate informed answer
 *
 * Example questions:
 * - "What is Mitable's business model?" → company intent, boosts Notion docs
 * - "What features are in the PRD?" → product intent, boosts product specs
 * - "What did we discuss last week?" → operations intent, boosts Slack
 * - "How do we deploy?" → technical intent, boosts codebase + docs
 */
export class SearchKnowledgeTool extends BaseTool {
  name = "search_knowledge";

  description = `Search the company knowledge base (Slack messages and Notion documentation) for relevant information. 
Use this tool when the user asks questions about company policies, processes, tools, or any information that might be documented.
Returns relevant excerpts from Slack conversations and Notion pages with source links.`;

  parameters: ToolParameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query or question to find relevant information for",
      },
      topK: {
        type: "number",
        description: "Number of results to return (default: 5, max: 10)",
        default: 5,
      },
    },
    required: ["query"],
  };

  /**
   * Execute knowledge search
   *
   * @param args - Contains query and optional topK
   * @param context - User and conversation context
   * @returns Search results with sources
   */
  async execute(args: { query: string; topK?: number }, context: ToolContext): Promise<ToolResult> {
    // Validate arguments
    this.validate(args);

    const { query, topK = 5 } = args;

    // Validate topK range
    const limitedTopK = Math.min(Math.max(topK, 1), 10);

    // Fetch more results from Pinecone for better trust ranking
    // We'll apply trust ranking to a larger set, then take top K
    const fetchLimit = Math.min(limitedTopK * 10, 50); // 10x the requested amount, max 50

    console.log(
      `[SearchKnowledgeTool] Searching for: "${query}" (topK: ${limitedTopK}, fetching: ${fetchLimit})`
    );

    try {
      // Step 1: Detect user intent for intelligent ranking
      const intent = await intentService.analyzeIntent({
        message: query,
        conversationHistory: context.conversationHistory || [],
      });

      console.log(
        `[SearchKnowledgeTool] Detected intent: ${intent.type} (confidence: ${intent.confidence})`
      );

      // Step 2: Generate embedding for the search query
      const embedding = await embeddingService.embedText(query);

      // Step 3: Get organization ID for namespace filtering
      const organizationId = context.userProfile?.organizationId;
      if (!organizationId) {
        throw new Error("Organization ID not found in user context");
      }

      const namespace = `org-${organizationId}`;
      console.log(`[SearchKnowledgeTool] Querying namespace: ${namespace}`);

      // Step 4: Query Pinecone for similar vectors (fetch more for better ranking)
      const rawResults = await vectorService.queryVectors(embedding, fetchLimit, namespace);

      console.log(`[SearchKnowledgeTool] Found ${rawResults.length} raw results`);

      // Step 5: Apply trust-based ranking to the larger set
      const rankedResults = trustRankingService.applyTrustRanking(rawResults, intent, query);

      // Step 6: Take top K after ranking
      const results = rankedResults.slice(0, limitedTopK);

      console.log(
        `[SearchKnowledgeTool] Returning top ${results.length} of ${rankedResults.length} ranked results`
      );

      // Step 7: Check if we found any results
      if (!results || results.length === 0) {
        return {
          messageType: "text",
          content:
            "I couldn't find any relevant information in the knowledge base for that question. This might be something new or not yet documented.",
          streamable: true,
        };
      }

      // Step 8: Format results as context for AI
      const contextParts: string[] = [];
      const sources: Array<{
        title: string;
        url: string;
        snippet: string;
      }> = [];

      for (const match of results) {
        const metadata = match.metadata || {};

        // Format based on source type (Slack or Notion)
        if (metadata.source === "slack") {
          const channelName = metadata.channel_name || "Unknown Channel";
          const username = metadata.username || "Unknown User";
          const text = metadata.text || "";
          const timestamp = metadata.timestamp
            ? new Date(Number(metadata.timestamp) * 1000).toISOString()
            : "";

          const timestampStr = timestamp ? ` [${timestamp}]` : "";
          contextParts.push(`[Slack - #${channelName}]${timestampStr} ${username}: ${text}`);

          sources.push({
            title: `#${channelName} - ${username}`,
            url: metadata.message_url || "#",
            snippet: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
          });
        } else if (metadata.source === "notion") {
          const pageTitle = metadata.page_title || "Untitled Page";
          const text = metadata.text || "";
          const blockType = metadata.block_type || "paragraph";
          const lastEdited = metadata.last_edited_time || "";

          const timestampStr = lastEdited ? ` [Last edited: ${lastEdited}]` : "";
          contextParts.push(`[Notion - ${pageTitle}]${timestampStr} (${blockType}): ${text}`);

          sources.push({
            title: `${pageTitle} (Notion)`,
            url: metadata.page_url || "#",
            snippet: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
          });
        } else {
          // Unknown source type
          const text = metadata.text || JSON.stringify(metadata);
          contextParts.push(`[${metadata.source || "Unknown"}] ${text}`);

          sources.push({
            title: metadata.title || "Unknown Source",
            url: metadata.url || "#",
            snippet: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
          });
        }
      }

      // Step 6: Join all context into a single string
      const contextText = contextParts.join("\n\n");

      console.log(`[SearchKnowledgeTool] Returning ${sources.length} sources`);

      // Step 9: Return formatted result with sources for AI to cite
      // Format sources as a list at the end for AI to reference
      const sourcesText = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n");

      const contentWithSources = `${contextText}\n\n---\nAvailable sources to cite:\n${sourcesText}`;

      return {
        messageType: "text",
        content: contentWithSources,
        sources: sources,
        streamable: true,
      };
    } catch (error) {
      console.error("[SearchKnowledgeTool] Error during search:", error);
      throw new Error("Failed to search knowledge base", { cause: error });
    }
  }
}
