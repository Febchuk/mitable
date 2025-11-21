/**
 * WorkRetriever - GitHub Work Items (Commits, PRs, Issues)
 * 
 * Retrieves development activity and discussions:
 * - Commit summaries (what changed, why, who)
 * - Pull Requests (code reviews, discussions)
 * - Issues (bug reports, feature requests)
 * 
 * Separate from code.retriever because work items:
 * - Have different structure (no file paths/line numbers)
 * - Need recency boosting (latest commits matter more)
 * - Are time-series data (ordered by date)
 */

import { vectorService } from "../services/vector.service.js";
import { embeddingService } from "../services/embedding.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/search-content.schema.js";
import { sql, eq, and } from "drizzle-orm";

// ============ Types ============

export interface WorkItem {
  id: string;
  type: 'commit' | 'pr' | 'issue';
  title: string;
  description: string;
  author: string;
  authorAvatar?: string;
  createdAt: Date;
  updatedAt?: Date;
  url?: string;
  repoFullName: string;
  score: number;
  
  // Type-specific fields
  commitSha?: string;
  prNumber?: number;
  issueNumber?: number;
  state?: 'open' | 'closed' | 'merged';
  labels?: string[];
}

export interface WorkRetrievalContext {
  organizationId: string;
  repoId?: string;
  repoFullName?: string;
  type?: ('commit' | 'pr' | 'issue')[]; // Which types to include
  state?: 'open' | 'closed' | 'all'; // For PRs/issues
  author?: string;
  since?: Date; // Only items after this date
}

export interface WorkRetrievalResult {
  items: WorkItem[];
  totalItems: number;
  searchTime: number;
}

// ============ Retriever ============

export class WorkRetriever {
  /**
   * Retrieve GitHub work items relevant to the query
   * 
   * Strategy:
   * 1. Semantic search via Pinecone (commit/PR/issue embeddings)
   * 2. Boost by recency (latest items ranked higher)
   * 3. Filter by type, state, author
   * 4. Return structured work items
   */
  async retrieve(
    query: string,
    context: WorkRetrievalContext,
    options: {
      topK?: number;
    } = {}
  ): Promise<WorkRetrievalResult> {
    const startTime = Date.now();
    const { topK = 10 } = options;
    
    // Default to all types if not specified
    const includeTypes = context.type || ['commit', 'pr', 'issue'];
    
    console.log(`[WorkRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      repoId: context.repoId,
      types: includeTypes,
      topK,
    });

    // Hybrid search: 70% semantic + 30% keyword
    const semanticResults = await this.semanticSearch(query, context, topK * 2, includeTypes);
    const keywordResults = await this.keywordSearch(query, context, topK * 2, includeTypes);
    
    // Merge with RRF (Reciprocal Rank Fusion)
    const results = this.mergeResults(semanticResults, keywordResults);
    
    // Detect "latest" queries - heavily prioritize recency
    const isLatestQuery = /\b(latest|recent|newest|last|most recent)\b/i.test(query);
    
    // Apply recency boost (latest commits/PRs/issues rank higher)
    const boosted = this.applyRecencyBoost(results, isLatestQuery);
    
    // Sort: For "latest" queries, sort by DATE first (newest first), then by score
    // For other queries, sort by score only
    const sorted = boosted
      .sort((a, b) => {
        if (isLatestQuery) {
          // Latest queries: DATE is primary sort, score is tiebreaker
          const dateDiff = b.createdAt.getTime() - a.createdAt.getTime();
          if (dateDiff !== 0) return dateDiff;
          return b.score - a.score;
        }
        // Normal queries: sort by score
        return b.score - a.score;
      })
      .slice(0, isLatestQuery ? 1 : topK); // For "latest" queries, return only the top 1
    
    const searchTime = Date.now() - startTime;
    
    console.log(`[WorkRetriever] Found ${sorted.length} work items in ${searchTime}ms`);
    if (isLatestQuery && sorted.length > 0) {
      console.log(`[WorkRetriever] Latest item (by date): "${sorted[0].title}" (${sorted[0].createdAt.toISOString()})`);
    }
    
    return {
      items: sorted,
      totalItems: sorted.length,
      searchTime,
    };
  }

  /**
   * Semantic search via Pinecone WITH METADATA FILTERING
   */
  private async semanticSearch(
    query: string,
    context: WorkRetrievalContext,
    limit: number,
    includeTypes: ('commit' | 'pr' | 'issue')[]
  ): Promise<WorkItem[]> {
    // Generate embedding
    const [embedding] = await embeddingService.embedTexts([query]);
    
    // Build metadata filter to scope search BEFORE retrieval
    const filter: Record<string, any> = {
      source: 'github',
    };
    
    // Add type filter (commit OR pr OR issue)
    if (includeTypes.length === 1) {
      filter.type = includeTypes[0];
    } else {
      filter.type = { $in: includeTypes };
    }
    
    // Add optional context filters
    if (context.repoId) {
      filter.repo_id = context.repoId;
    }
    if (context.repoFullName) {
      filter.repo_full_name = context.repoFullName;
    }
    if (context.author) {
      filter.author = context.author;
    }
    
    console.log(`[WorkRetriever] Pinecone filter:`, JSON.stringify(filter));
    
    // Query Pinecone WITH METADATA FILTER (scoped BEFORE ranking)
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);
    
    console.log(`[WorkRetriever] Semantic search: ${results.length} work items (filtered at query time)`);
    
    // Transform to WorkItem
    return results.map((result) => this.transformToWorkItem(result));
  }

  /**
   * Keyword search via PostgreSQL FTS
   */
  private async keywordSearch(
    query: string,
    context: WorkRetrievalContext,
    limit: number,
    includeTypes: ('commit' | 'pr' | 'issue')[]
  ): Promise<WorkItem[]> {
    const conditions = [
      eq(searchContent.source, "github"),
      eq(searchContent.organizationId, context.organizationId),
    ];
    
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
        sql`ts_rank(${searchContent.textVector}, plainto_tsquery('english', ${query})) DESC`
      )
      .limit(limit);
    
    console.log(`[WorkRetriever] Keyword search: ${results.length} results`);
    
    return results
      .map((r) => {
        const type = r.id.startsWith('gh-commit-') ? 'commit' 
          : r.id.startsWith('gh-pr-') ? 'pr' 
          : r.id.startsWith('gh-issue-') ? 'issue' 
          : null;
        
        if (!type || !includeTypes.includes(type)) return null;
        
        const lines = r.text.split('\n');
        const title = lines[0]?.replace(/^(Commit|PR|Issue): /, '') || 'Untitled';
        const author = lines.find((l: string) => l.startsWith('Author:'))?.split(':')[1]?.trim() || 'Unknown';
        const dateStr = lines.find((l: string) => l.startsWith('Date:'))?.split('Date:')[1]?.trim();
        
        return {
          id: r.id,
          type,
          title,
          description: r.text,
          author,
          createdAt: dateStr ? new Date(dateStr) : new Date(),
          score: 1.0,
          repoFullName: '',
        } as WorkItem;
      })
      .filter((item): item is WorkItem => item !== null);
  }

  /**
   * Merge semantic + keyword results with 70/30 weighting
   */
  private mergeResults(
    semanticResults: WorkItem[],
    keywordResults: WorkItem[]
  ): WorkItem[] {
    const resultsMap = new Map<string, WorkItem>();
    
    semanticResults.forEach((item) => {
      resultsMap.set(item.id, { ...item, score: item.score * 0.7 });
    });
    
    keywordResults.forEach((item) => {
      if (resultsMap.has(item.id)) {
        const existing = resultsMap.get(item.id)!;
        existing.score += 0.3;
      } else {
        resultsMap.set(item.id, { ...item, score: item.score * 0.3 });
      }
    });
    
    return Array.from(resultsMap.values());
  }

  /**
   * Transform Pinecone result to WorkItem
   */
  private transformToWorkItem(result: any): WorkItem {
    const metadata = result.metadata;
    const type = metadata.type as 'commit' | 'pr' | 'issue';
    
    return {
      id: result.id,
      type,
      title: metadata.message || metadata.pr_title || metadata.issue_title || 'Untitled',
      description: metadata.text || '',
      author: metadata.author || metadata.created_by || 'Unknown',
      authorAvatar: metadata.author_avatar,
      createdAt: new Date(metadata.committed_at || metadata.created_at || Date.now()),
      updatedAt: metadata.updated_at ? new Date(metadata.updated_at) : undefined,
      url: metadata.url || metadata.pr_url || metadata.issue_url,
      repoFullName: metadata.repo_full_name || '',
      score: result.score,
      
      // Type-specific
      commitSha: type === 'commit' ? metadata.commit_sha : undefined,
      prNumber: type === 'pr' ? metadata.pr_number : undefined,
      issueNumber: type === 'issue' ? metadata.issue_number : undefined,
      state: metadata.state,
      labels: metadata.labels ? JSON.parse(metadata.labels) : undefined,
    };
  }

  /**
   * Apply recency boost to work items
   * 
   * Latest items are more relevant for queries like "latest commit"
   * Normal boost: 2x for last 7 days, 1.5x for last 30 days, 1.2x for last 90 days
   * "Latest" query boost: 10x for last 7 days, 5x for last 30 days, 2x for last 90 days
   */
  private applyRecencyBoost(items: WorkItem[], isLatestQuery = false): WorkItem[] {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    
    return items.map(item => {
      const ageMs = now - item.createdAt.getTime();
      const ageDays = ageMs / DAY_MS;
      
      let boost = 1.0;
      
      if (isLatestQuery) {
        // Heavy recency bias for "latest" queries
        if (ageDays <= 7) {
          boost = 10.0; // Massively boost very recent items
        } else if (ageDays <= 30) {
          boost = 5.0; 
        } else if (ageDays <= 90) {
          boost = 2.0;
        }
      } else {
        // Normal recency boost
        if (ageDays <= 7) {
          boost = 2.0;
        } else if (ageDays <= 30) {
          boost = 1.5;
        } else if (ageDays <= 90) {
          boost = 1.2;
        }
      }
      
      return {
        ...item,
        score: item.score * boost,
      };
    });
  }
}

export const workRetriever = new WorkRetriever();
