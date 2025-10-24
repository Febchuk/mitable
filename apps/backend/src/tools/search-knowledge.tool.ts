import { BaseTool, ToolContext, ToolResult, ToolParameters } from "./base.tool";
import { searchService } from "../services/search.service";
import { intentService } from "../services/intent.service";
import { trustRankingService } from "../services/trust-ranking.service";

/**
 * SearchKnowledgeTool
 *
 * Phase 2 of the agentic system - Hybrid search with RAG + trust-based ranking
 *
 * This tool enables the AI to search the company's knowledge base
 * (Slack messages + Notion pages) using hybrid search that combines:
 * - Semantic search (Pinecone vector similarity) for conceptual matches
 * - Keyword search (PostgreSQL FTS) for exact term matches
 * - RRF (Reciprocal Rank Fusion) to merge both results (70% semantic + 30% keyword)
 *
 * Features:
 * - Hybrid search: Combines semantic understanding + keyword precision
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
 * 2. Perform hybrid search (Pinecone semantic + PostgreSQL keyword)
 * 3. Apply RRF merge (70/30 weighting)
 * 4. Apply trust-based ranking to boost relevant sources
 * 5. Return top K most relevant results
 * 6. AI uses this context to generate informed answer
 *
 * Example questions:
 * - "What is Mitable's business model?" → company intent, boosts Notion docs
 * - "What features are in the PRD?" → product intent, boosts product specs
 * - "What did we discuss last week?" → operations intent, boosts Slack
 * - "How do we deploy?" → technical intent, finds both concepts AND exact terms
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
        description: "Number of results to return (default: 10, max: 15). Use more results for complex queries or when asking about specific people's work.",
        default: 10,
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

    const { query, topK = 10 } = args;

    // Validate topK range
    const limitedTopK = Math.min(Math.max(topK, 1), 15);

    // Fetch more results from Pinecone for better trust ranking
    // We'll apply trust ranking to a larger set, then take top K
    const fetchLimit = Math.min(limitedTopK * 10, 50); // 10x the requested amount, max 50

    // Get organization ID for namespace filtering
    const organizationId = context.userProfile?.organizationId;

    console.log(`[SearchKnowledgeTool] Searching for: "${query}"`);
    console.log("[SearchKnowledgeTool] Organization context:", {
      organizationId: organizationId || "none",
      topK: limitedTopK,
      fetchLimit,
    });

    try {
      // Step 1: Detect user intent for intelligent ranking
      const intent = await intentService.analyzeIntent({
        message: query,
        conversationHistory: context.conversationHistory || [],
      });

      console.log(
        `[SearchKnowledgeTool] Detected intent: ${intent.type} (confidence: ${intent.confidence})`
      );

      // Step 2: Validate organization ID
      if (!organizationId) {
        throw new Error("Organization ID not found in user context");
      }

      // Step 3: Parse temporal keywords for date filtering
      const dateFilters = this.parseTemporalKeywords(query);
      
      console.log("[SearchKnowledgeTool] Performing hybrid search:", {
        organizationId,
        query,
        fetchLimit,
        dateFilters,
      });

      // Step 4: Perform hybrid search (combines Pinecone semantic + PostgreSQL keyword with RRF)
      const searchResponse = await searchService.search({
        query,
        organizationId,
        filters: dateFilters,
        topK: fetchLimit, // Fetch more for trust ranking
      });

      console.log(`[SearchKnowledgeTool] Hybrid search complete:`, {
        totalResults: searchResponse.totalResults,
        semanticResults: searchResponse.semanticResults,
        keywordResults: searchResponse.keywordResults,
        searchTime: `${searchResponse.searchTime}ms`,
      });

      // Step 4: Transform to old format for trust ranking compatibility
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

      // Step 5: Apply trust-based ranking to the hybrid results
      const rankedResults = trustRankingService.applyTrustRanking(rawResults, intent, query);

      // Step 6: Take top K after ranking
      const results = rankedResults.slice(0, limitedTopK);

      console.log(
        `[SearchKnowledgeTool] Returning top ${results.length} of ${rankedResults.length} ranked results`
      );

      // Step 7: Check if we found any results
      if (!results || results.length === 0) {
        console.log("[SearchKnowledgeTool] No results found");

        // Build helpful no-results message with date context
        const now = new Date();
        let noResultsMessage = "I couldn't find any information in the knowledge base for that query.";
        
        if (dateFilters) {
          const dateFrom = dateFilters.dateFrom;
          const dateTo = dateFilters.dateTo;
          
          if (dateFrom && dateTo) {
            const fromStr = dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const toStr = dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            noResultsMessage = `I couldn't find any messages in the knowledge base between ${fromStr} and ${toStr}. `;
            
            // Check if future date
            if (dateFrom > now) {
              noResultsMessage += "Note: This date range is in the future, so no data exists yet.";
            } else {
              noResultsMessage += "The data for this period may not have been synced yet, or there may not have been any relevant discussions during that time.";
            }
          }
        } else {
          noResultsMessage += " This might be something new, not yet documented, or outside the synced data range.";
        }

        return {
          messageType: "text",
          content: noResultsMessage,
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

      // Step 9: Join all context into a single string
      const contextText = contextParts.join("\n\n");

      console.log(`[SearchKnowledgeTool] Returning ${sources.length} sources`);

      // Step 10: Return formatted result with sources for AI to cite
      // Format sources as a list at the end for AI to reference
      const sourcesText = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n");

      const contentWithSources = `${contextText}\n\n---\nAvailable sources to cite:\n${sourcesText}`;

      console.log("[SearchKnowledgeTool] Success - returning knowledge:", {
        responseLength: contentWithSources.length,
        sourcesCount: sources.length,
        sourceNames: sources.map((s) => s.title),
      });

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
      const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days, else go to Monday
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
      const lastWeekStart = getStartOfWeek(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = getEndOfWeek(lastWeekStart);
      return {
        dateFrom: lastWeekStart,
        dateTo: lastWeekEnd,
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
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return {
        dateFrom: yesterday,
        dateTo: yesterdayEnd,
      };
    }

    // "this month"
    if (/\bthis month\b/i.test(queryLower)) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        dateFrom: startOfMonth,
        dateTo: endOfMonth,
      };
    }

    // "last N days"
    const lastDaysMatch = queryLower.match(/\blast (\d+) days?\b/i);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1]);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      return {
        dateFrom: startDate,
        dateTo: now,
      };
    }

    // No temporal keywords found
    return undefined;
  }
}
