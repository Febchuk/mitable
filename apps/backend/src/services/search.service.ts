import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql, and, eq, gte, lte, inArray, SQL } from "drizzle-orm";
import type { QueryResult } from "./vector.service.js";

/**
 * Search query filters
 */
export interface SearchFilters {
  source?: "slack" | "notion";
  sources?: ("slack" | "notion")[];
  channels?: string[];
  users?: string[];
  pageIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Search query parameters
 */
export interface SearchQuery {
  query: string;
  organizationId: string;
  filters?: SearchFilters;
  topK?: number; // Number of results to return (default: 20)
}

/**
 * Individual search result with metadata
 */
export interface SearchResult {
  id: string;
  text: string;
  snippet?: string; // Text with context around match
  score: number; // Combined RRF score (0-1)
  semanticScore?: number; // Raw Pinecone cosine similarity
  keywordScore?: number; // Raw PostgreSQL ts_rank
  
  // Source metadata
  source: "slack" | "notion";
  sourceType?: string;
  
  // Slack metadata
  channelId?: string;
  channelName?: string;
  userId?: string;
  username?: string;
  messageUrl?: string;
  
  // Notion metadata
  pageId?: string;
  pageTitle?: string;
  pageUrl?: string;
  blockId?: string;
  blockType?: string;
  
  // Chunk metadata
  chunkIndex?: number;
  totalChunks?: number;
  isChunked?: boolean;
  
  // Temporal
  timestamp?: number;
  date?: string;
}

/**
 * Search response with results and metadata
 */
export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  semanticResults: number;
  keywordResults: number;
  searchTime: number; // milliseconds
}

/**
 * RRF (Reciprocal Rank Fusion) configuration
 */
const RRF_CONFIG = {
  K: 60, // Constant for RRF formula: score = 1 / (k + rank)
  SEMANTIC_WEIGHT: 0.7, // 70% weight for semantic search
  KEYWORD_WEIGHT: 0.3, // 30% weight for keyword search
} as const;

/**
 * Search Service
 * Implements hybrid search combining Pinecone (semantic) + PostgreSQL (keyword)
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */
class SearchService {
  /**
   * Perform hybrid search combining semantic and keyword search
   */
  async search(params: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const { query, organizationId, filters, topK = 20 } = params;

    if (!query || query.trim().length === 0) {
      throw new Error("Search query cannot be empty");
    }

    try {
      // Run both searches in parallel for performance
      const [semanticResults, keywordResults] = await Promise.all([
        this.semanticSearch(query, organizationId, filters, topK * 2), // Fetch more for better RRF
        this.keywordSearch(query, organizationId, filters, topK * 2),
      ]);

      // Merge results using RRF
      const mergedResults = this.mergeWithRRF(semanticResults, keywordResults, topK);

      // Extract snippets
      const resultsWithSnippets = mergedResults.map((result) =>
        this.addSnippet(result, query)
      );

      return {
        results: resultsWithSnippets,
        totalResults: resultsWithSnippets.length,
        semanticResults: semanticResults.length,
        keywordResults: keywordResults.length,
        searchTime: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error("Hybrid search failed", { cause: error });
    }
  }

  /**
   * Semantic search using Pinecone vector similarity
   */
  private async semanticSearch(
    query: string,
    organizationId: string,
    filters?: SearchFilters,
    topK: number = 40
  ): Promise<SearchResult[]> {
    try {
      // Generate embedding for query
      const [queryEmbedding] = await embeddingService.embedTexts([query]);

      // Build Pinecone metadata filter
      const pineconeFilter: Record<string, any> = {
        organization_id: organizationId,
      };

      if (filters?.source) {
        pineconeFilter.source = filters.source;
      }

      if (filters?.sources && filters.sources.length > 0) {
        pineconeFilter.source = { $in: filters.sources };
      }

      if (filters?.channels && filters.channels.length > 0) {
        pineconeFilter.channel_id = { $in: filters.channels };
      }

      if (filters?.users && filters.users.length > 0) {
        pineconeFilter.user_id = { $in: filters.users };
      }

      if (filters?.pageIds && filters.pageIds.length > 0) {
        pineconeFilter.page_id = { $in: filters.pageIds };
      }

      if (filters?.dateFrom || filters?.dateTo) {
        const timestampFilter: any = {};
        if (filters.dateFrom) {
          // Convert to Unix timestamp (seconds)
          timestampFilter.$gte = Math.floor(filters.dateFrom.getTime() / 1000);
        }
        if (filters.dateTo) {
          // Convert to Unix timestamp (seconds)
          timestampFilter.$lte = Math.floor(filters.dateTo.getTime() / 1000);
        }
        // Only add if we have at least one date filter
        if (Object.keys(timestampFilter).length > 0) {
          pineconeFilter.timestamp = timestampFilter;
        }
      }

      console.log("[SearchService] Pinecone filter:", JSON.stringify(pineconeFilter));

      // Query Pinecone
      const namespace = `org-${organizationId}`;
      const results = await vectorService.queryVectors(
        queryEmbedding,
        topK,
        namespace,
        pineconeFilter
      );

      // Transform to SearchResult format
      return results.map((result) => this.transformPineconeResult(result));
    } catch (error) {
      throw new Error("Semantic search failed", { cause: error });
    }
  }

  /**
   * Keyword search using PostgreSQL full-text search
   */
  private async keywordSearch(
    query: string,
    organizationId: string,
    filters?: SearchFilters,
    topK: number = 40
  ): Promise<SearchResult[]> {
    try {
      // Build WHERE clause with filters
      const conditions: SQL[] = [eq(searchContent.organizationId, organizationId)];

      if (filters?.source) {
        conditions.push(eq(searchContent.source, filters.source));
      }

      if (filters?.sources && filters.sources.length > 0) {
        conditions.push(inArray(searchContent.source, filters.sources));
      }

      if (filters?.channels && filters.channels.length > 0) {
        conditions.push(inArray(searchContent.channelId, filters.channels));
      }

      if (filters?.users && filters.users.length > 0) {
        conditions.push(inArray(searchContent.userId, filters.users));
      }

      if (filters?.pageIds && filters.pageIds.length > 0) {
        conditions.push(inArray(searchContent.pageId, filters.pageIds));
      }

      if (filters?.dateFrom) {
        conditions.push(gte(searchContent.date, filters.dateFrom.toISOString().split("T")[0]));
      }

      if (filters?.dateTo) {
        conditions.push(lte(searchContent.date, filters.dateTo.toISOString().split("T")[0]));
      }

      // Perform FTS query with ts_rank for relevance scoring
      // Using plainto_tsquery for simple query parsing
      const results = await db
        .select({
          id: searchContent.id,
          text: searchContent.text,
          source: searchContent.source,
          sourceType: searchContent.sourceType,
          channelId: searchContent.channelId,
          channelName: searchContent.channelName,
          userId: searchContent.userId,
          username: searchContent.username,
          pageId: searchContent.pageId,
          pageTitle: searchContent.pageTitle,
          blockId: searchContent.blockId,
          blockType: searchContent.blockType,
          chunkIndex: searchContent.chunkIndex,
          totalChunks: searchContent.totalChunks,
          isChunked: searchContent.isChunked,
          timestamp: searchContent.timestamp,
          date: searchContent.date,
          rank: sql<number>`ts_rank(${searchContent.textVector}, plainto_tsquery('english', ${query}))`,
        })
        .from(searchContent)
        .where(
          and(
            ...conditions,
            sql`${searchContent.textVector} @@ plainto_tsquery('english', ${query})`
          )
        )
        .orderBy(sql`ts_rank(${searchContent.textVector}, plainto_tsquery('english', ${query})) DESC`)
        .limit(topK);

      // Transform to SearchResult format
      return results.map((result) => this.transformPostgresResult(result));
    } catch (error) {
      throw new Error("Keyword search failed", { cause: error });
    }
  }

  /**
   * Merge semantic and keyword results using Reciprocal Rank Fusion (RRF)
   * Formula: score = weight_semantic * (1 / (k + rank_semantic)) + weight_keyword * (1 / (k + rank_keyword))
   */
  private mergeWithRRF(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    topK: number
  ): SearchResult[] {
    // Create maps for quick lookup
    const semanticMap = new Map(
      semanticResults.map((result, index) => [result.id, { result, rank: index + 1 }])
    );
    const keywordMap = new Map(
      keywordResults.map((result, index) => [result.id, { result, rank: index + 1 }])
    );

    // Collect all unique IDs
    const allIds = new Set([...semanticMap.keys(), ...keywordMap.keys()]);

    // Calculate RRF scores
    const scoredResults = Array.from(allIds).map((id) => {
      const semanticEntry = semanticMap.get(id);
      const keywordEntry = keywordMap.get(id);

      // Calculate RRF scores
      const semanticScore = semanticEntry
        ? 1 / (RRF_CONFIG.K + semanticEntry.rank)
        : 0;
      const keywordScore = keywordEntry
        ? 1 / (RRF_CONFIG.K + keywordEntry.rank)
        : 0;

      // Weighted combination
      const combinedScore =
        RRF_CONFIG.SEMANTIC_WEIGHT * semanticScore +
        RRF_CONFIG.KEYWORD_WEIGHT * keywordScore;

      // Use result from whichever source has it (prefer semantic for metadata completeness)
      const baseResult = semanticEntry?.result || keywordEntry!.result;

      // Apply recency boost: content from last 7 days gets 1.5x boost, last 30 days gets 1.2x
      let recencyBoost = 1.0;
      if (baseResult.date) {
        const resultDate = new Date(baseResult.date);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - resultDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7) {
          recencyBoost = 1.5; // Last 7 days: 50% boost
        } else if (daysDiff <= 30) {
          recencyBoost = 1.2; // Last 30 days: 20% boost
        }
      }

      const finalScore = combinedScore * recencyBoost;

      return {
        ...baseResult,
        score: finalScore,
        semanticScore: semanticEntry?.result.score,
        keywordScore: keywordEntry?.result.score,
      };
    });

    // Sort by combined score (descending) and return top K
    return scoredResults.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Add snippet with context around the match
   * Extracts ±100 characters around the search term
   */
  private addSnippet(result: SearchResult, query: string): SearchResult {
    const text = result.text;
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Find first occurrence of query term (simple approach)
    const matchIndex = textLower.indexOf(queryLower);

    if (matchIndex === -1) {
      // No exact match, return start of text
      return {
        ...result,
        snippet: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
      };
    }

    // Extract ±100 chars around match
    const start = Math.max(0, matchIndex - 100);
    const end = Math.min(text.length, matchIndex + query.length + 100);

    const snippet =
      (start > 0 ? "..." : "") +
      text.substring(start, end) +
      (end < text.length ? "..." : "");

    return {
      ...result,
      snippet,
    };
  }

  /**
   * Transform Pinecone result to SearchResult
   */
  private transformPineconeResult(result: QueryResult): SearchResult {
    const metadata = result.metadata;

    return {
      id: result.id,
      text: metadata.text || "",
      score: result.score,
      source: (metadata.source as "slack" | "notion") || "slack",
      sourceType: metadata.source_type,
      channelId: metadata.channel_id,
      channelName: metadata.channel_name,
      userId: metadata.user_id,
      username: metadata.username,
      pageId: metadata.page_id,
      pageTitle: metadata.page_title,
      pageUrl: metadata.page_url,
      blockId: metadata.block_id,
      blockType: metadata.block_type,
      chunkIndex: metadata.chunk_index,
      totalChunks: metadata.total_chunks,
      isChunked: metadata.is_chunked,
      timestamp: metadata.timestamp,
      date: metadata.date,
    };
  }

  /**
   * Transform PostgreSQL result to SearchResult
   */
  private transformPostgresResult(result: any): SearchResult {
    return {
      id: result.id,
      text: result.text,
      score: result.rank || 0,
      source: result.source as "slack" | "notion",
      sourceType: result.sourceType || undefined,
      channelId: result.channelId || undefined,
      channelName: result.channelName || undefined,
      userId: result.userId || undefined,
      username: result.username || undefined,
      pageId: result.pageId || undefined,
      pageTitle: result.pageTitle || undefined,
      blockId: result.blockId || undefined,
      blockType: result.blockType || undefined,
      chunkIndex: result.chunkIndex || undefined,
      totalChunks: result.totalChunks || undefined,
      isChunked: result.isChunked || undefined,
      timestamp: result.timestamp || undefined,
      date: result.date || undefined,
    };
  }
}

// Export singleton instance
export const searchService = new SearchService();
