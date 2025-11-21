/**
 * SlackRetriever - Domain-specific retrieval for Slack conversations
 * 
 * Purpose: Find relevant Slack messages, threads, and discussions
 * 
 * Priorities (different from code and docs):
 * 1. Recency matters MORE - Recent discussions are more relevant (1.5x boost for last 7 days)
 * 2. Thread context is CRITICAL - Need parent + all replies
 * 3. Conversational grouping - Group by thread, not individual messages
 * 4. Channel context - Channel names provide important context
 * 5. User attribution - Who said it matters
 * 
 * This is FOCUSED on Slack's conversational nature.
 */

import { embeddingService } from "../services/embedding.service.js";
import { vectorService } from "../services/vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql, and, eq, gte, lte, desc } from "drizzle-orm";

export interface SlackRetrievalContext {
  organizationId: string;
  channels?: string[];      // Filter to specific channels
  users?: string[];          // Filter by user
  dateFrom?: Date;
  dateTo?: Date;
}

export interface SlackMessage {
  id: string;
  score: number;
  text: string;
  
  // Slack context
  channelId: string;
  channelName: string;
  userId?: string;
  username: string;
  messageUrl?: string;
  messageTs: string;         // Slack's message timestamp (unique ID)
  threadTs?: string;         // Parent thread timestamp
  
  // Temporal
  timestamp: number;         // Unix timestamp (seconds)
  date: string;              // ISO date string
}

export interface SlackThread {
  channelId: string;
  channelName: string;
  threadTs: string;          // Parent message timestamp
  messages: SlackMessage[];  // Parent + all replies
  topScore: number;          // Highest message score in thread
  permalink?: string;        // Link to thread
}

export interface SlackRetrievalResult {
  threads: SlackThread[];    // Grouped by thread
  totalMessages: number;
  searchTime: number;
}

export class SlackRetriever {
  /**
   * Retrieve Slack messages and threads relevant to the query
   * 
   * Strategy:
   * 1. Semantic search via Pinecone
   * 2. Keyword search via PostgreSQL FTS
   * 3. Merge with RRF (70% semantic, 30% keyword)
   * 4. Apply recency boost (recent is better)
   * 5. Expand threads (fetch parent + replies)
   * 6. Group by thread
   */
  async retrieve(
    query: string,
    context: SlackRetrievalContext,
    options: {
      topK?: number;
    } = {}
  ): Promise<SlackRetrievalResult> {
    const startTime = Date.now();
    const { topK = 20 } = options;
    
    console.log(`[SlackRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      channels: context.channels,
      topK,
    });

    // Step 1: Hybrid search (semantic + keyword)
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, context, topK * 2),
      this.keywordSearch(query, context, topK * 2),
    ]);
    
    // Step 2: Merge with RRF
    const merged = this.mergeWithRRF(semanticResults, keywordResults);
    
    // Step 3: Apply recency boost
    const boosted = this.applyRecencyBoost(merged);
    
    // Step 4: Take top K
    const topMessages = boosted.sort((a, b) => b.score - a.score).slice(0, topK);
    
    // Step 5: Expand threads (fetch full conversation context)
    const expanded = await this.expandThreads(topMessages);
    
    // Step 6: Group by thread
    const threads = this.groupByThread(expanded);
    
    const searchTime = Date.now() - startTime;
    
    console.log(`[SlackRetriever] Found ${threads.length} threads (${expanded.length} messages) in ${searchTime}ms`);
    
    return {
      threads,
      totalMessages: expanded.length,
      searchTime,
    };
  }

  /**
   * Semantic search via Pinecone
   */
  private async semanticSearch(
    query: string,
    context: SlackRetrievalContext,
    limit: number
  ): Promise<SlackMessage[]> {
    const [embedding] = await embeddingService.embedTexts([query]);
    
    // Build Pinecone filter to scope search BEFORE retrieval
    const filter: Record<string, any> = {
      source: "slack",
    };
    
    // Add optional context filters
    if (context.channels) filter.channel_id = { $in: context.channels };
    if (context.users) filter.user_id = { $in: context.users };
    if (context.dateFrom || context.dateTo) {
      const timestampFilter: any = {};
      if (context.dateFrom) timestampFilter.$gte = Math.floor(context.dateFrom.getTime() / 1000);
      if (context.dateTo) timestampFilter.$lte = Math.floor(context.dateTo.getTime() / 1000);
      filter.timestamp = timestampFilter;
    }
    
    console.log(`[SlackRetriever] Pinecone filter:`, JSON.stringify(filter));
    
    // Query Pinecone WITH METADATA FILTER (scoped BEFORE ranking)
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);
    
    console.log(`[SlackRetriever] Semantic search: ${results.length} messages (filtered at query time)`);
    
    // Transform to SlackMessage (no need to filter again, already filtered by Pinecone)
    return results.map(r => this.transformToSlackMessage(r));
  }

  /**
   * Keyword search via PostgreSQL FTS
   */
  private async keywordSearch(
    query: string,
    context: SlackRetrievalContext,
    limit: number
  ): Promise<SlackMessage[]> {
    const conditions = [
      eq(searchContent.source, "slack"),
    ];
    
    // Add date filters if present
    if (context.dateFrom) {
      conditions.push(gte(searchContent.timestamp, Math.floor(context.dateFrom.getTime() / 1000)));
    }
    if (context.dateTo) {
      conditions.push(lte(searchContent.timestamp, Math.floor(context.dateTo.getTime() / 1000)));
    }
    
    const results = await db
      .select()
      .from(searchContent)
      .where(
        and(
          ...conditions,
          sql`${searchContent.textVector} @@ plainto_tsquery('english', ${query})`
        )
      )
      .orderBy(
        desc(sql`ts_rank(${searchContent.textVector}, plainto_tsquery('english', ${query}))`)
      )
      .limit(limit);
    
    console.log(`[SlackRetriever] Keyword: ${results.length} results`);
    
    return results.map(r => ({
      id: r.id,
      score: 0.5,
      text: r.text || "",
      channelId: r.channelId || "",
      channelName: r.channelName || "unknown",
      userId: r.userId || undefined,
      username: r.username || "unknown",
      messageUrl: undefined,
      messageTs: r.id.split("-")[2] || "",  // Extract from ID
      threadTs: undefined,
      timestamp: r.timestamp || 0,
      date: r.timestamp ? new Date(r.timestamp * 1000).toISOString() : "",
    }));
  }

  /**
   * Merge semantic + keyword with RRF
   */
  private mergeWithRRF(
    semantic: SlackMessage[],
    keyword: SlackMessage[]
  ): SlackMessage[] {
    const resultsMap = new Map<string, SlackMessage>();
    
    // RRF formula: score = 0.7 * (1/(60 + semantic_rank)) + 0.3 * (1/(60 + keyword_rank))
    semantic.forEach((msg, rank) => {
      resultsMap.set(msg.id, {
        ...msg,
        score: 0.7 * (1 / (60 + rank)),
      });
    });
    
    keyword.forEach((msg, rank) => {
      if (resultsMap.has(msg.id)) {
        const existing = resultsMap.get(msg.id)!;
        existing.score += 0.3 * (1 / (60 + rank));
      } else {
        resultsMap.set(msg.id, {
          ...msg,
          score: 0.3 * (1 / (60 + rank)),
        });
      }
    });
    
    return Array.from(resultsMap.values());
  }

  /**
   * Apply recency boost - Recent Slack messages are MORE relevant
   * 
   * CRITICAL for Slack (unlike code where old = often correct)
   */
  private applyRecencyBoost(messages: SlackMessage[]): SlackMessage[] {
    const now = Date.now() / 1000; // Current time in seconds
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    
    return messages.map(msg => {
      const age = now - msg.timestamp;
      let boost = 1.0;
      
      if (age < SEVEN_DAYS) {
        boost = 1.5; // 50% boost for last 7 days
      } else if (age < THIRTY_DAYS) {
        boost = 1.2; // 20% boost for last 30 days
      }
      
      return {
        ...msg,
        score: msg.score * boost,
      };
    });
  }

  /**
   * Expand threads - Fetch parent + all replies for complete context
   * 
   * Slack-specific: Messages in threads need full conversation
   */
  private async expandThreads(
    messages: SlackMessage[]
  ): Promise<SlackMessage[]> {
    // Identify thread messages
    const threadTsSet = new Set<string>();
    messages.forEach(msg => {
      if (msg.threadTs) threadTsSet.add(msg.threadTs);
    });
    
    if (threadTsSet.size === 0) {
      return messages; // No threads to expand
    }
    
    console.log(`[SlackRetriever] Expanding ${threadTsSet.size} threads...`);
    
    // Fetch all messages in these threads from PostgreSQL
    const threadMessages = await db
      .select()
      .from(searchContent)
      .where(
        and(
          eq(searchContent.source, "slack"),
          sql`(
            ${searchContent.id} IN (
              SELECT id FROM ${searchContent}
              WHERE source = 'slack'
              AND (
                -- Parent messages
                ${searchContent.id} LIKE ANY(ARRAY[${sql.join(
                  Array.from(threadTsSet).map(ts => sql`${"slack-%"}${ts}${"-%"}`),
                  sql`, `
                )}])
                OR
                -- Thread replies (stored in metadata or message_ts)
                true -- TODO: Need proper thread_ts column or metadata query
              )
            )
          )`
        )
      );
    
    // Combine with original results
    const allMessages = [...messages];
    
    threadMessages.forEach(tm => {
      if (!allMessages.some(m => m.id === tm.id)) {
        allMessages.push({
          id: tm.id,
          score: 0, // Thread context messages get 0 score (included for context)
          text: tm.text || "",
          channelId: tm.channelId || "",
          channelName: tm.channelName || "unknown",
          userId: tm.userId || undefined,
          username: tm.username || "unknown",
          messageTs: tm.id.split("-")[2] || "",
          timestamp: tm.timestamp || 0,
          date: tm.timestamp ? new Date(tm.timestamp * 1000).toISOString() : "",
        });
      }
    });
    
    return allMessages;
  }

  /**
   * Group messages by thread for coherent context
   */
  private groupByThread(messages: SlackMessage[]): SlackThread[] {
    const threadsMap = new Map<string, SlackThread>();
    
    messages.forEach(msg => {
      const threadKey = msg.threadTs || msg.messageTs; // Parent or standalone
      
      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, {
          channelId: msg.channelId,
          channelName: msg.channelName,
          threadTs: threadKey,
          messages: [],
          topScore: 0,
        });
      }
      
      const thread = threadsMap.get(threadKey)!;
      thread.messages.push(msg);
      thread.topScore = Math.max(thread.topScore, msg.score);
    });
    
    // Sort threads by top score
    return Array.from(threadsMap.values())
      .sort((a, b) => b.topScore - a.topScore);
  }

  /**
   * Transform Pinecone result to SlackMessage
   */
  private transformToSlackMessage(result: any): SlackMessage {
    return {
      id: result.id,
      score: result.score,
      text: result.metadata.text || "",
      channelId: result.metadata.channel_id || "",
      channelName: result.metadata.channel_name || "unknown",
      userId: result.metadata.user_id,
      username: result.metadata.username || "unknown",
      messageUrl: result.metadata.message_url,
      messageTs: result.metadata.message_ts || "",
      threadTs: result.metadata.thread_ts,
      timestamp: result.metadata.timestamp || 0,
      date: result.metadata.last_edited_time || "",
    };
  }
}

export const slackRetriever = new SlackRetriever();
