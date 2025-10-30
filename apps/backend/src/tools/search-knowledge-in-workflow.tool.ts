import { BaseTool, ToolContext, ToolResult, ToolParameters } from "./base.tool.js";
import { searchService } from "../services/search.service.js";
import { intentService } from "../services/intent.service.js";
import { trustRankingService } from "../services/trust-ranking.service.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";

/**
 * Search Knowledge In Workflow Tool
 *
 * Searches company knowledge base (Slack + Notion) DURING an active workflow.
 * Uses hybrid search (semantic + keyword) with trust-based ranking.
 * Preserves workflow state so WorkflowOptions UI remains visible after answering.
 *
 * TRIGGER MECHANISM:
 * This tool is called when:
 * 1. User selects "Type something" (option 2) from WorkflowOptions
 * 2. User asks a KNOWLEDGE question about features/concepts needing documentation
 * 3. Agent service provides hint via metadata.workflowAction === "custom_question"
 *
 * DIFFERENCES FROM search_knowledge:
 * - Requires conversationId to retrieve workflow state
 * - Returns messageType: "workflow" (not "text")
 * - Includes full SolutionObject in cardData to preserve workflow
 * - Sets workflowPhase: "custom_question" to trigger special UI
 *
 * EXAMPLES OF WHEN TO USE:
 * - "What is the [feature] used for?"
 * - "How does [concept] work?"
 * - "Can you explain what [term] means?"
 * - "What are the benefits of [feature]?"
 *
 * DO NOT USE FOR:
 * - Visual/UI issues → Use analyze_workflow_screen instead
 * - Conceptual questions → Use respond_with_text_in_workflow instead
 * - Questions outside active workflows → Use search_knowledge instead
 */
export class SearchKnowledgeInWorkflowTool extends BaseTool {
  name = "search_knowledge_in_workflow";

  description = `Search the company knowledge base during an active workflow while preserving workflow state.

WHEN TO USE:
This tool is for KNOWLEDGE questions about features, concepts, or documentation during a workflow.
User has selected "Type something" from WorkflowOptions and asked a question that requires
searching Slack/Notion documentation to answer.

Examples:
- "What is the [feature] used for?"
- "How does [concept] work?"
- "Can you explain what [term] means?"
- "What are the benefits of [feature]?"
- "Where can I find documentation about [topic]?"

CRITICAL REQUIREMENTS:
1. ConversationId MUST be provided (to retrieve workflow state)
2. Active workflow must exist in conversation
3. Question requires searching documentation (not answerable from AI knowledge)

BEHAVIOR:
1. Retrieves current SolutionObject to get workflow state
2. Searches knowledge base using hybrid search (semantic + keyword)
3. Applies trust-based ranking based on intent
4. Returns search results with workflow state preserved in cardData
5. WorkflowOptions UI remains visible with custom_question phase options

DO NOT USE:
- Visual/UI issues → Use analyze_workflow_screen instead
- Conceptual questions → Use respond_with_text_in_workflow instead
- Questions outside workflows → Use search_knowledge instead`.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      conversationId: {
        type: "string",
        description: "The conversation ID containing the active workflow state",
      },
      query: {
        type: "string",
        description: "The search query or question to find relevant information for",
      },
      topK: {
        type: "number",
        description:
          "Number of results to return (default: 10, max: 15). Use more results for complex queries.",
        default: 10,
      },
    },
    required: ["conversationId", "query"],
  };

  async execute(
    args: { conversationId: string; query: string; topK?: number },
    context: ToolContext
  ): Promise<ToolResult> {
    this.validate(args);

    const { conversationId, query, topK = 10 } = args;

    // Validate topK range
    const limitedTopK = Math.min(Math.max(topK, 1), 15);

    // Fetch more results from Pinecone for better trust ranking
    const fetchLimit = Math.min(limitedTopK * 10, 50);

    // Get organization ID for namespace filtering
    const organizationId = context.userProfile?.organizationId;

    console.log(`[SearchKnowledgeInWorkflowTool] Searching for: "${query}"`);
    console.log("[SearchKnowledgeInWorkflowTool] Context:", {
      organizationId: organizationId || "none",
      conversationId,
      topK: limitedTopK,
      fetchLimit,
    });

    try {
      // Step 1: Retrieve current workflow state
      const currentSolution = await guideGenerationService.retrieveLatestSolutionObject(
        conversationId
      );

      if (!currentSolution) {
        console.warn(
          "[SearchKnowledgeInWorkflowTool] No active workflow found - falling back to search_knowledge behavior"
        );
      } else {
        console.log("[SearchKnowledgeInWorkflowTool] Workflow state retrieved:", {
          currentStepIndex: currentSolution.currentStepIndex,
          totalSteps: currentSolution.stepList.length,
        });
      }

      // Step 2: Detect user intent for intelligent ranking
      const intent = await intentService.analyzeIntent({
        message: query,
        conversationHistory: context.conversationHistory || [],
      });

      console.log(
        `[SearchKnowledgeInWorkflowTool] Detected intent: ${intent.type} (confidence: ${intent.confidence})`
      );

      // Step 3: Validate organization ID
      if (!organizationId) {
        throw new Error("Organization ID not found in user context");
      }

      // Step 4: Parse temporal keywords for date filtering
      const dateFilters = this.parseTemporalKeywords(query);

      console.log("[SearchKnowledgeInWorkflowTool] Performing hybrid search:", {
        organizationId,
        query,
        fetchLimit,
        dateFilters,
      });

      // Step 5: Perform hybrid search (combines Pinecone semantic + PostgreSQL keyword with RRF)
      const searchResponse = await searchService.search({
        query,
        organizationId,
        filters: dateFilters,
        topK: fetchLimit,
      });

      console.log(`[SearchKnowledgeInWorkflowTool] Hybrid search complete:`, {
        totalResults: searchResponse.totalResults,
        semanticResults: searchResponse.semanticResults,
        keywordResults: searchResponse.keywordResults,
        searchTime: `${searchResponse.searchTime}ms`,
      });

      // Step 6: Transform to old format for trust ranking compatibility
      const rawResults = searchResponse.results.map((result) => ({
        id: result.id,
        score: result.score,
        metadata: {
          text: result.text,
          source: result.source,
          source_type: result.sourceType,
          channel_name: result.channelName,
          username: result.username,
          page_title: result.pageTitle,
          page_url: result.pageUrl,
          block_type: result.blockType,
          timestamp: result.timestamp,
          last_edited_time: result.date,
          message_url: result.messageUrl,
          title: result.channelName || result.pageTitle || "Untitled",
        },
      }));

      // Step 7: Apply trust-based ranking to the hybrid results
      const rankedResults = trustRankingService.applyTrustRanking(rawResults, intent, query);

      // Step 8: Take top K after ranking
      const results = rankedResults.slice(0, limitedTopK);

      console.log(
        `[SearchKnowledgeInWorkflowTool] Returning top ${results.length} of ${rankedResults.length} ranked results`
      );

      // Step 9: Check if we found any results
      if (!results || results.length === 0) {
        console.log("[SearchKnowledgeInWorkflowTool] No results found");

        const noResultsMessage =
          "I couldn't find any information in the knowledge base for that query. This might be something new, not yet documented, or outside the synced data range.";

        // If no workflow, return text response
        if (!currentSolution) {
          return {
            messageType: "text",
            content: noResultsMessage,
            streamable: true,
          };
        }

        // Return with workflow state preserved
        return {
          messageType: "workflow",
          content: noResultsMessage,
          cardData: {
            ...currentSolution,
            workflowActive: true,
            workflowPhase: "custom_question",
          },
          streamable: true,
        };
      }

      // Step 10: Format results as context for AI
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

      // Step 11: Join all context into a single string
      const contextText = contextParts.join("\n\n");

      console.log(`[SearchKnowledgeInWorkflowTool] Returning ${sources.length} sources`);

      // Step 12: Return formatted result with sources for AI to cite
      const sourcesText = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n");

      const contentWithSources = `${contextText}\n\n---\nAvailable sources to cite:\n${sourcesText}`;

      console.log("[SearchKnowledgeInWorkflowTool] Success - returning knowledge:", {
        responseLength: contentWithSources.length,
        sourcesCount: sources.length,
      });

      // If no workflow, return text response (fallback)
      if (!currentSolution) {
        return {
          messageType: "text",
          content: contentWithSources,
          sources: sources,
          streamable: true,
        };
      }

      // Return with workflow state preserved
      return {
        messageType: "workflow",
        content: contentWithSources,
        sources: sources,
        cardData: {
          ...currentSolution,
          workflowActive: true,
          workflowPhase: "custom_question",
        },
        streamable: true,
      };
    } catch (error) {
      console.error("[SearchKnowledgeInWorkflowTool] Error during search:", error);
      throw new Error("Failed to search knowledge base", { cause: error });
    }
  }

  /**
   * Parse temporal keywords from query and convert to date filters
   * Handles "this week", "last week", "today", "yesterday", etc.
   */
  private parseTemporalKeywords(query: string): { dateFrom?: Date; dateTo?: Date } | undefined {
    const queryLower = query.toLowerCase();
    const now = new Date();

    // Get start of current week (Monday)
    const getStartOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Get end of current week (Sunday)
    const getEndOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? 0 : 7 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    // "this week" = current calendar week (Mon-Sun)
    if (/\bthis week\b/i.test(queryLower)) {
      return {
        dateFrom: getStartOfWeek(now),
        dateTo: getEndOfWeek(now),
      };
    }

    // "last week" = previous calendar week
    if (/\blast week\b/i.test(queryLower)) {
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);
      return {
        dateFrom: getStartOfWeek(lastWeek),
        dateTo: getEndOfWeek(lastWeek),
      };
    }

    // "today"
    if (/\btoday\b/i.test(queryLower)) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      return {
        dateFrom: startOfDay,
        dateTo: endOfDay,
      };
    }

    // "yesterday"
    if (/\byesterday\b/i.test(queryLower)) {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);
      return {
        dateFrom: yesterday,
        dateTo: endOfYesterday,
      };
    }

    // "last month"
    if (/\blast month\b/i.test(queryLower)) {
      const lastMonth = new Date(now);
      lastMonth.setMonth(now.getMonth() - 1);
      lastMonth.setDate(1);
      lastMonth.setHours(0, 0, 0, 0);

      const endOfLastMonth = new Date(now);
      endOfLastMonth.setDate(0); // Go to last day of previous month
      endOfLastMonth.setHours(23, 59, 59, 999);

      return {
        dateFrom: lastMonth,
        dateTo: endOfLastMonth,
      };
    }

    return undefined;
  }
}
