/**
 * NotionRetriever - Domain-specific retrieval for Notion documentation
 * 
 * Purpose: Find relevant Notion pages, blocks, and documentation
 * 
 * Priorities (different from Slack and code):
 * 1. Semantic similarity is PRIMARY - Docs are formal, semantic search shines
 * 2. Page/block structure matters - Hierarchy provides context
 * 3. Recency matters LESS - Documentation is often evergreen
 * 4. Completeness over snippets - Show full sections, not fragments
 * 5. Page-level grouping - Group by page, not individual blocks
 * 
 * This is FOCUSED on Notion's documentation structure.
 */

import { embeddingService } from "../services/embedding.service.js";
import { vectorService } from "../services/vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql, and, eq, gte, lte, desc } from "drizzle-orm";

export interface NotionRetrievalContext {
  organizationId: string;
  pageIds?: string[];        // Filter to specific pages
  dateFrom?: Date;
  dateTo?: Date;
}

export interface NotionBlock {
  id: string;
  score: number;
  text: string;
  
  // Notion context
  pageId: string;
  pageTitle: string;
  pageUrl?: string;
  blockId: string;
  blockType: string;         // "paragraph" | "heading" | "code" | etc.
  
  // Temporal
  lastEditedTime?: string;   // ISO date string
}

export interface NotionPage {
  pageId: string;
  pageTitle: string;
  pageUrl?: string;
  blocks: NotionBlock[];     // All matching blocks from this page
  topScore: number;          // Highest block score
  lastEditedTime?: string;
}

export interface NotionRetrievalResult {
  pages: NotionPage[];       // Grouped by page
  totalBlocks: number;
  searchTime: number;
}

export class NotionRetriever {
  /**
   * Retrieve Notion blocks and pages relevant to the query
   * 
   * Strategy:
   * 1. Semantic search via Pinecone (PRIMARY for docs)
   * 2. Keyword search via PostgreSQL FTS (SECONDARY)
   * 3. Merge with RRF (80% semantic, 20% keyword - different from Slack!)
   * 4. Light recency boost (optional, less than Slack)
   * 5. Group by page for coherent context
   */
  async retrieve(
    query: string,
    context: NotionRetrievalContext,
    options: {
      topK?: number;
    } = {}
  ): Promise<NotionRetrievalResult> {
    const startTime = Date.now();
    const { topK = 20 } = options;
    
    console.log(`[NotionRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      pageIds: context.pageIds,
      topK,
    });

    // Step 1: Hybrid search (semantic-heavy for docs)
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, context, topK * 2),
      this.keywordSearch(query, context, topK * 2),
    ]);
    
    // Step 2: Merge with RRF (80/20 for docs, not 70/30 like Slack)
    const merged = this.mergeWithRRF(semanticResults, keywordResults);
    
    // Step 3: Optional light recency boost (much lighter than Slack)
    const boosted = this.applyLightRecencyBoost(merged);
    
    // Step 4: Take top K
    const topBlocks = boosted.sort((a, b) => b.score - a.score).slice(0, topK);
    
    // Step 5: Group by page
    const pages = this.groupByPage(topBlocks);
    
    const searchTime = Date.now() - startTime;
    
    console.log(`[NotionRetriever] Found ${pages.length} pages (${topBlocks.length} blocks) in ${searchTime}ms`);
    
    return {
      pages,
      totalBlocks: topBlocks.length,
      searchTime,
    };
  }

  /**
   * Semantic search via Pinecone
   */
  private async semanticSearch(
    query: string,
    context: NotionRetrievalContext,
    limit: number
  ): Promise<NotionBlock[]> {
    const [embedding] = await embeddingService.embedTexts([query]);
    
    // Build Pinecone filter to scope search BEFORE retrieval
    const filter: Record<string, any> = {
      source: "notion",
    };
    
    // Add optional context filters
    if (context.pageIds) filter.page_id = { $in: context.pageIds };
    if (context.dateFrom || context.dateTo) {
      const timestampFilter: any = {};
      if (context.dateFrom) timestampFilter.$gte = Math.floor(context.dateFrom.getTime() / 1000);
      if (context.dateTo) timestampFilter.$lte = Math.floor(context.dateTo.getTime() / 1000);
      filter.timestamp = timestampFilter;
    }
    
    console.log(`[NotionRetriever] Pinecone filter:`, JSON.stringify(filter));
    
    // Query Pinecone WITH METADATA FILTER (scoped BEFORE ranking)
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);
    
    console.log(`[NotionRetriever] Semantic search: ${results.length} blocks (filtered at query time)`);
    
    // Transform to NotionBlock (no need to filter again, already filtered by Pinecone)
    return results.map(r => this.transformToNotionBlock(r));
  }

  /**
   * Keyword search via PostgreSQL FTS
   */
  private async keywordSearch(
    query: string,
    context: NotionRetrievalContext,
    limit: number
  ): Promise<NotionBlock[]> {
    const conditions = [
      eq(searchContent.source, "notion"),
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
    
    console.log(`[NotionRetriever] Keyword: ${results.length} results`);
    
    return results.map(r => ({
      id: r.id,
      score: 0.5,
      text: r.text || "",
      pageId: r.pageId || "",
      pageTitle: r.pageTitle || "Untitled",
      pageUrl: undefined, // Not in search_content, only in Pinecone metadata
      blockId: r.blockId || "",
      blockType: r.blockType || "paragraph",
      lastEditedTime: undefined, // Not in search_content, only in Pinecone metadata
    }));
  }

  /**
   * Merge semantic + keyword with RRF
   * 
   * 80/20 weighting for docs (semantic is more important than keyword)
   */
  private mergeWithRRF(
    semantic: NotionBlock[],
    keyword: NotionBlock[]
  ): NotionBlock[] {
    const resultsMap = new Map<string, NotionBlock>();
    
    // RRF formula: score = 0.8 * (1/(60 + semantic_rank)) + 0.2 * (1/(60 + keyword_rank))
    semantic.forEach((block, rank) => {
      resultsMap.set(block.id, {
        ...block,
        score: 0.8 * (1 / (60 + rank)),  // 80% semantic for docs
      });
    });
    
    keyword.forEach((block, rank) => {
      if (resultsMap.has(block.id)) {
        const existing = resultsMap.get(block.id)!;
        existing.score += 0.2 * (1 / (60 + rank));  // 20% keyword
      } else {
        resultsMap.set(block.id, {
          ...block,
          score: 0.2 * (1 / (60 + rank)),
        });
      }
    });
    
    return Array.from(resultsMap.values());
  }

  /**
   * Apply LIGHT recency boost - Documentation is often evergreen
   * 
   * Much lighter than Slack (1.1x vs 1.5x for recent)
   */
  private applyLightRecencyBoost(blocks: NotionBlock[]): NotionBlock[] {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    
    return blocks.map(block => {
      if (!block.lastEditedTime) return block;
      
      const lastEdited = new Date(block.lastEditedTime).getTime();
      const age = now - lastEdited;
      let boost = 1.0;
      
      if (age < THIRTY_DAYS) {
        boost = 1.1; // 10% boost for last 30 days (much lighter than Slack)
      } else if (age < NINETY_DAYS) {
        boost = 1.05; // 5% boost for last 90 days
      }
      
      return {
        ...block,
        score: block.score * boost,
      };
    });
  }

  /**
   * Group blocks by page for coherent context
   */
  private groupByPage(blocks: NotionBlock[]): NotionPage[] {
    const pagesMap = new Map<string, NotionPage>();
    
    blocks.forEach(block => {
      if (!pagesMap.has(block.pageId)) {
        pagesMap.set(block.pageId, {
          pageId: block.pageId,
          pageTitle: block.pageTitle,
          pageUrl: block.pageUrl,
          blocks: [],
          topScore: 0,
          lastEditedTime: block.lastEditedTime,
        });
      }
      
      const page = pagesMap.get(block.pageId)!;
      page.blocks.push(block);
      page.topScore = Math.max(page.topScore, block.score);
      
      // Update lastEditedTime to most recent
      if (block.lastEditedTime) {
        if (!page.lastEditedTime || block.lastEditedTime > page.lastEditedTime) {
          page.lastEditedTime = block.lastEditedTime;
        }
      }
    });
    
    // Sort pages by top score
    return Array.from(pagesMap.values())
      .sort((a, b) => b.topScore - a.topScore);
  }

  /**
   * Transform Pinecone result to NotionBlock
   */
  private transformToNotionBlock(result: any): NotionBlock {
    return {
      id: result.id,
      score: result.score,
      text: result.metadata.text || "",
      pageId: result.metadata.page_id || "",
      pageTitle: result.metadata.page_title || "Untitled",
      pageUrl: result.metadata.page_url,
      blockId: result.metadata.block_id || "",
      blockType: result.metadata.block_type || "paragraph",
      lastEditedTime: result.metadata.last_edited_time,
    };
  }
}

export const notionRetriever = new NotionRetriever();
