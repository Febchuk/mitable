import { BaseTool, ToolContext, ToolResult, ToolParameters } from "./base.tool";
import { searchService } from "../services/search.service";
import { intentService } from "../services/intent.service";
import { trustRankingService } from "../services/trust-ranking.service";
import { tokenCounter, MAX_CONTEXT_TOKENS } from "../utils/token-counter";
import {
  buildThreadBundles,
  scoreThreadBundle,
  buildThreadRollup,
  formatThreadForContext,
  type ThreadBundle,
} from "../utils/slack-thread.utils.js";
import { db } from "../db/client.js";
import { integrations } from "../domains/integrations/schema/integrations.schema.js";
import { eq, and } from "drizzle-orm";

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
        description:
          "Number of results to return (default: 20, max: 25). Use more results for complex queries or when asking about specific people's work.",
        default: 20,
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

    // We'll set limitedTopK after we detect temporal intent so we can raise caps
    let limitedTopK = Math.min(Math.max(topK, 1), 25);
    let fetchLimit = Math.min(limitedTopK * 15, 100); // default

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

      // Step 3: Detect temporal queries and parse date filters
      const isTemporal = this.isTemporalQuery(query);

      // For temporal queries, raise caps to improve coverage and reduce late-month bias
      if (isTemporal) {
        limitedTopK = 100; // allow up to 100 items to pass through
        fetchLimit = 100; // and fetch maximum from the stores
      }
      const dateFilters = this.parseTemporalKeywords(query);

      console.log("[SearchKnowledgeTool] Performing hybrid search:", {
        organizationId,
        query,
        fetchLimit,
        isTemporal,
        dateFilters,
      });

      // Step 4: Perform hybrid search (combines Pinecone semantic + PostgreSQL keyword with RRF)
      const searchResponse = await searchService.search({
        query,
        organizationId,
        filters: dateFilters,
        topK: fetchLimit, // Fetch more for ranking/selection
      });

      console.log(`[SearchKnowledgeTool] Hybrid search complete:`, {
        totalResults: searchResponse.totalResults,
        semanticResults: searchResponse.semanticResults,
        keywordResults: searchResponse.keywordResults,
        searchTime: `${searchResponse.searchTime}ms`,
      });

      // Step 4: Transform to old format (compatibility with ranking & bundle utils)
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

      // Step 5: Apply ranking
      // IMPORTANT: For temporal queries, skip trust boosts (avoid recency/source bias)
      const rankedResults = isTemporal
        ? rawResults
        : trustRankingService.applyTrustRanking(rawResults, intent, query);

      // Step 6: Take top K after ranking
      const topResults = rankedResults.slice(0, limitedTopK);

      // Step 6.5: Expand Slack thread context
      // If any top results are thread replies, fetch parent + all replies for complete context
      const expandedSearchResults = await searchService.fetchThreadContext(
        searchResponse.results.filter((r) => topResults.some((tr) => tr.id === r.id)),
        organizationId
      );

      // Transform back to old format after thread expansion
      const results = expandedSearchResults.map((result) => ({
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
          message_ts: result.messageTs,
          thread_ts: result.threadTs,
          title: result.channelName || result.pageTitle || "Untitled",
        },
      }));

      console.log(
        `[SearchKnowledgeTool] After thread expansion: ${results.length} results (from top ${topResults.length})`
      );

      // Step 7: Check if we found any results
      if (!results || results.length === 0) {
        console.log("[SearchKnowledgeTool] No results found");

        // Build helpful no-results message with date context
        const now = new Date();
        let noResultsMessage =
          "I couldn't find any information in the knowledge base for that query.";

        if (dateFilters) {
          const dateFrom = dateFilters.dateFrom;
          const dateTo = dateFilters.dateTo;

          if (dateFrom && dateTo) {
            const fromStr = dateFrom.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const toStr = dateTo.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            noResultsMessage = `I couldn't find any messages in the knowledge base between ${fromStr} and ${toStr}. `;

            // Check if future date
            if (dateFrom > now) {
              noResultsMessage += "Note: This date range is in the future, so no data exists yet.";
            } else {
              noResultsMessage +=
                "The data for this period may not have been synced yet, or there may not have been any relevant discussions during that time.";
            }
          }
        } else {
          noResultsMessage +=
            " This might be something new, not yet documented, or outside the synced data range.";
        }

        return {
          messageType: "text",
          content: noResultsMessage,
          streamable: true,
        };
      }

      // Step 8: Get Slack workspace ID for permalinks
      const workspaceId = await this.getSlackWorkspaceId(organizationId);

      // Step 9: Build thread bundles and score them
      const slackResults = expandedSearchResults.filter((r) => r.source === "slack");
      const notionResults = expandedSearchResults.filter((r) => r.source === "notion");

      let threadBundles: ThreadBundle[] = [];
      if (slackResults.length > 0) {
        threadBundles = buildThreadBundles(slackResults, workspaceId);

        if (isTemporal) {
          // Sort thread bundles chronologically by earliest message timestamp (oldest → newest)
          threadBundles.sort((a, b) => {
            const aTs = a.messages?.[0]?.timestamp ?? 0;
            const bTs = b.messages?.[0]?.timestamp ?? 0;
            return aTs - bTs;
          });

          // Distribute evenly across the entire period: take up to 2 per day
          const perDay = 2;
          const maxThreads = 20;
          const byDay = new Map<string, ThreadBundle[]>();
          for (const tb of threadBundles) {
            const tsSec = tb.messages?.[0]?.timestamp ?? 0;
            const dateKey = new Date(tsSec * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
            if (!byDay.has(dateKey)) byDay.set(dateKey, []);
            byDay.get(dateKey)!.push(tb);
          }
          const sampled: ThreadBundle[] = [];
          for (const day of [...byDay.keys()].sort()) {
            const dayThreads = byDay.get(day)!;
            // If more than perDay, lightly sort by simple size/score heuristic
            dayThreads.sort((a, b) => (b.messages?.length ?? 0) - (a.messages?.length ?? 0));
            sampled.push(...dayThreads.slice(0, perDay));
            if (sampled.length >= maxThreads) break;
          }
          threadBundles = sampled.slice(0, maxThreads);
        } else {
          // Score and sort bundles by relevance
          threadBundles.forEach((bundle) => {
            bundle.score = scoreThreadBundle(bundle);
          });
          threadBundles.sort((a, b) => b.score - a.score);
          // Take top 5-6 thread bundles
          threadBundles = threadBundles.slice(0, 6);
        }
      }

      console.log(
        `[SearchKnowledgeTool] Bundled ${slackResults.length} Slack messages into ${threadBundles.length} threads`
      );

      const contextParts: string[] = [];
      const sources: Array<{ title: string; url: string; snippet: string }> = [];

      if (isTemporal) {
        // Build a date-grouped digest across the whole month (oldest → newest)
        const byDay = new Map<string, typeof expandedSearchResults>();
        for (const r of expandedSearchResults) {
          const ts = (r.timestamp || 0) * 1000; // seconds → ms
          const dateKey = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
          if (!byDay.has(dateKey)) byDay.set(dateKey, []);
          byDay.get(dateKey)!.push(r);
        }

        const perDay = 3; // sample 3 per day
        const maxItems = 40; // cap total
        let total = 0;

        for (const day of [...byDay.keys()].sort()) {
          const items = byDay
            .get(day)!
            .slice()
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, perDay);

          if (items.length === 0) continue;

          // Friendly date header
          const d = new Date(`${day}T00:00:00Z`);
          const header = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
          contextParts.push(`== ${header} ==`);

          const seen = new Set<string>();
          for (const it of items) {
            let title = "";
            let url: string | undefined;
            const snippet = (it.text || "").trim().replace(/\s+/g, " ");

            // Prefer Slack formatting when channel/message info is present
            if (it.source === "slack" || it.channelName || it.messageTs) {
              title = `#${it.channelName || it.channelId || "channel"} - ${it.username || "Unknown"}`;
              url = it.messageUrl;
              if (!url && workspaceId && it.channelId && (it.messageTs || it.threadTs)) {
                const tsRaw = String(it.messageTs || it.threadTs);
                const tsForPermalink = tsRaw.includes(".") ? tsRaw.replace(".", "") : tsRaw;
                url = `https://${workspaceId}.slack.com/archives/${it.channelId}/p${tsForPermalink}`;
              }
            } else if (it.source === "notion" || it.pageUrl || it.pageTitle) {
              title = `[Notion] ${it.pageTitle || "Untitled Page"}`;
              url = it.pageUrl;
            } else {
              // Fallback: skip invalid/unknown sources to avoid broken '#' links
              title = "";
            }

            // Append digest line regardless (it's part of narrative)
            const displayTitle = title || it.source || "Source";
            contextParts.push(`• ${displayTitle}: ${snippet}`);

            // Only collect valid sources with proper URLs
            // Filter out: localhost, empty fragments, invalid domains, missing titles
            const isValidUrl =
              url &&
              /^https?:\/\//i.test(url) &&
              !url.includes("localhost") &&
              !url.includes("127.0.0.1") &&
              !url.endsWith("#") &&
              title; // Must have a proper title (not fallback "Source")

            if (isValidUrl && title && url) {
              const key = `${title}|${url}`;
              if (!seen.has(key)) {
                seen.add(key);
                sources.push({
                  title,
                  url,
                  snippet: snippet.substring(0, 150) + (snippet.length > 150 ? "..." : ""),
                });
              }
            }

            total++;
            if (total >= maxItems) break;
          }

          if (total >= maxItems) break;
          contextParts.push("");
        }
      } else {
        // Non-temporal: thread-aware context
        // Step 10: Build thread rollup preamble
        const threadRollup = buildThreadRollup(threadBundles);

        // Step 11: Format context with thread-aware structure
        if (threadRollup) {
          contextParts.push(threadRollup);
          contextParts.push(""); // Blank line separator
        }

        // Format thread bundles
        for (const bundle of threadBundles) {
          const threadContext = formatThreadForContext(bundle, 5);
          contextParts.push(threadContext);

          // Add thread to sources (link to parent) - show username instead of thread title
          const parentMessage = bundle.messages[0];
          const username = parentMessage.username || "Unknown";
          const snippetText = parentMessage.text || "";

          // Only add if valid URL (not localhost, not empty fragment)
          const url = bundle.permalink;
          const isValidUrl =
            url &&
            /^https?:\/\//i.test(url) &&
            !url.includes("localhost") &&
            !url.includes("127.0.0.1") &&
            !url.endsWith("#");

          if (isValidUrl) {
            sources.push({
              title: `#${bundle.channelName} - ${username}`,
              url,
              snippet: snippetText.substring(0, 150) + (snippetText.length > 150 ? "..." : ""),
            });
          }
        }

        // Format Notion results (Slack already handled by thread bundles)
        for (const result of notionResults) {
          const pageTitle = result.pageTitle || "Untitled Page";
          const text = result.text || "";
          const blockType = result.blockType || "paragraph";
          const lastEdited = result.date || "";

          const timestampStr = lastEdited ? ` [Last edited: ${lastEdited}]` : "";
          contextParts.push(`[Notion - ${pageTitle}]${timestampStr} (${blockType}): ${text}`);

          // Only add if valid URL (not localhost, not empty, not just "#")
          const url = result.pageUrl;
          const isValidUrl =
            url &&
            /^https?:\/\//i.test(url) &&
            !url.includes("localhost") &&
            !url.includes("127.0.0.1") &&
            !url.endsWith("#") &&
            url !== "#";

          if (isValidUrl) {
            sources.push({
              title: `${pageTitle} (Notion)`,
              url,
              snippet: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
            });
          }
        }
      }

      // Step 9: Apply token limiting to prevent exceeding context window
      // Join and check total tokens
      let contextText = contextParts.join("\n\n");
      let finalSources = sources;
      let truncatedCount = 0;

      const totalTokens = tokenCounter.countTokens(contextText);

      if (totalTokens > MAX_CONTEXT_TOKENS) {
        console.warn(
          `[SearchKnowledgeTool] Context exceeds token limit: ${totalTokens} > ${MAX_CONTEXT_TOKENS}. Truncating...`
        );

        // Truncate by removing results from the end until we fit
        const currentContextParts = [...contextParts];

        while (currentContextParts.length > 0) {
          const testContext = currentContextParts.join("\n\n");
          const testTokens = tokenCounter.countTokens(testContext);

          if (testTokens <= MAX_CONTEXT_TOKENS) {
            contextText = testContext;
            // Keep all sources - they're metadata for citation, not consuming context tokens
            finalSources = sources;
            truncatedCount = results.length - currentContextParts.length;
            break;
          }

          // Remove last context item
          currentContextParts.pop();
        }

        console.log(
          `[SearchKnowledgeTool] Truncated to ${currentContextParts.length} results (removed ${truncatedCount}), final tokens: ${tokenCounter.countTokens(contextText)}`
        );
      }

      const finalTokens = tokenCounter.countTokens(contextText);
      console.log(
        `[SearchKnowledgeTool] Returning ${finalSources.length} sources (${finalTokens} tokens)`
      );

      // Step 9.5: Final validation - filter out ANY invalid URLs regardless of path
      const validatedSources = finalSources.filter((source) => {
        const url = source.url;
        const isValid =
          url &&
          typeof url === "string" &&
          /^https?:\/\//i.test(url) &&
          !url.includes("localhost") &&
          !url.includes("127.0.0.1") &&
          !url.endsWith("#") &&
          url !== "#" &&
          source.title &&
          source.title !== "Unknown" &&
          source.title !== "Source";

        if (!isValid) {
          console.warn(
            `[SearchKnowledgeTool] Filtered out invalid source: ${source.title} - ${url}`
          );
        }

        return isValid;
      });

      console.log(
        `[SearchKnowledgeTool] After validation: ${validatedSources.length}/${finalSources.length} sources`
      );

      // Step 10: Return formatted result with sources for AI to cite
      // Format sources as a list at the end for AI to reference
      const sourcesText = validatedSources
        .map((s, i) => `${i + 1}. ${s.title} - ${s.url}`)
        .join("\n");

      const contentWithSources = `${contextText}\n\n---\nAvailable sources to cite:\n${sourcesText}`;

      console.log("[SearchKnowledgeTool] Success - returning knowledge:", {
        responseLength: contentWithSources.length,
        sourcesCount: validatedSources.length,
        sourceNames: validatedSources.map((s) => s.title),
        tokenCount: tokenCounter.countTokens(contentWithSources),
        truncated: truncatedCount > 0,
        truncatedCount,
      });

      console.log(
        `[SearchKnowledgeTool] Returning ${validatedSources.length} sources:`,
        validatedSources.map((s) => `"${s.title}" - ${s.url}`)
      );

      return {
        messageType: "text",
        content: contentWithSources,
        sources: validatedSources,
        streamable: true,
        metadata: {
          isTemporal,
          dateFilters,
          // Provide structured results so KnowledgeAgent can do temporal sampling by timestamp
          results: expandedSearchResults.map((r) => ({
            id: r.id,
            score: r.score,
            source: r.source,
            sourceType: r.sourceType,
            channelId: r.channelId,
            channelName: r.channelName,
            username: r.username,
            pageTitle: r.pageTitle,
            pageUrl: r.pageUrl,
            timestamp: r.timestamp, // seconds since epoch
            date: r.date,
            messageUrl: r.messageUrl,
            messageTs: r.messageTs,
            threadTs: r.threadTs,
            text: r.text,
          })),
        },
      };
    } catch (error) {
      console.error("[SearchKnowledgeTool] Error during search:", error);
      throw new Error("Failed to search knowledge base", { cause: error });
    }
  }

  /**
   * Get Slack workspace ID from integrations metadata
   */
  private async getSlackWorkspaceId(organizationId: string): Promise<string> {
    try {
      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(eq(integrations.organizationId, organizationId), eq(integrations.provider, "slack"))
        )
        .limit(1);

      if (integration?.metadata && typeof integration.metadata === "object") {
        const metadata = integration.metadata as { team_id?: string; team_name?: string };
        return metadata.team_id || "workspace";
      }

      return "workspace"; // Fallback
    } catch (error) {
      console.warn("[SearchKnowledgeTool] Failed to fetch Slack workspace ID:", error);
      return "workspace"; // Fallback on error
    }
  }

  /**
   * Check if query is temporal (asking about a time period)
   * Returns true for queries like "what did we discuss in October?", "last week's updates", etc.
   */
  private isTemporalQuery(query: string): boolean {
    const queryLower = query.toLowerCase();

    // Temporal keywords that indicate chronological queries
    const temporalPatterns = [
      /\b(this|last|next)\s+(week|month|year|quarter)\b/i,
      /\b(today|yesterday|tomorrow)\b/i,
      /\blast\s+\d+\s+days?\b/i,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
      /\b(discuss|discussed|talk|talked|happen|happened|update|updates)\s+(in|during|last|this)\b/i,
      /\bwhat\s+(did|have|has)\s+we\s+(discuss|talk|do|work)\b/i,
    ];

    return temporalPatterns.some((pattern) => pattern.test(queryLower));
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

    // Specific month names (e.g., "in September", "September discussions", "last September")
    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];

    for (let i = 0; i < monthNames.length; i++) {
      const monthName = monthNames[i];
      const monthRegex = new RegExp(`\\b${monthName}\\b`, "i");

      if (monthRegex.test(queryLower)) {
        // Determine if "last September" or current year September
        const isLast = /\blast\s+/i.test(
          queryLower.match(new RegExp(`\\blast\\s+${monthName}`, "i"))?.[0] || ""
        );

        let year = now.getFullYear();

        // Smart year selection:
        // - "last October" → previous year
        // - "October" in November → this year (last month)
        // - "October" in September → assume they mean upcoming October (wait, no - assume last year's)
        // Actually, let's be smart: if the month hasn't happened yet this year, use last year
        if (isLast) {
          year = year - 1;
        } else if (i > now.getMonth()) {
          // Month is in the future this year → assume they mean last year
          year = year - 1;
        }

        const startOfMonth = new Date(year, i, 1);
        const endOfMonth = new Date(year, i + 1, 0, 23, 59, 59, 999);

        return {
          dateFrom: startOfMonth,
          dateTo: endOfMonth,
        };
      }
    }

    // No temporal keywords found
    return undefined;
  }
}
