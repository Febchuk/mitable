/**
 * WorkRetriever - Domain-specific retrieval for GitHub work domain
 *
 * Purpose: Find relevant commits, PRs, and issues to answer "what changed / why / when / who decided"
 *
 * Priorities (VERY different from CodeRetriever):
 * 1. RECENCY MATTERS - Recent commits/PRs/issues are way more relevant
 * 2. LABELS MATTER - "bug", "feature", "rag-system" are strong signals
 * 3. STATE MATTERS - Open issues/PRs often more actionable than closed
 * 4. MERGE STATUS - Merged PRs = accepted solutions
 * 5. DISCUSSION QUALITY - Many comments = important decision
 * 6. AREAS - Which part of codebase was affected
 *
 * This is optimized for historical/decision questions, NOT code structure.
 */

import { embeddingService } from "../domains/shared-infra/services/embedding.service.js";
import { vectorService } from "../domains/shared-infra/services/vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql, and, eq, desc, gte } from "drizzle-orm";

export interface WorkRetrievalContext {
  organizationId: string;
  repos?: string[]; // Filter to specific repos
  areas?: string[]; // Filter by area touched
  labels?: string[]; // Filter by labels (bug, feature, etc.)
  state?: "open" | "closed" | "all"; // Filter by state (default: all)
  dateRange?: {
    // Filter by date range
    start?: Date;
    end?: Date;
  };
  authors?: string[]; // Filter by author
  includeComments?: boolean; // Include comment windows (default: true)
}

export interface WorkChunk {
  id: string;
  score: number;
  text: string;

  // Work context
  repoFullName: string;
  chunkType: string; // commit_summary | pr_summary | issue_summary | pr_comments | issue_comments
  area?: string;

  // Temporal
  committedAt: string;
  author: string;

  // Work-specific metadata
  labels?: string[];
  state?: string; // open | closed | merged
  isMerged?: boolean;
  commentCount?: number;
}

export interface WorkRetrievalResult {
  chunks: WorkChunk[];
  totalChunks: number;
  searchTime: number;
  truncated: boolean;
  estimatedTokens: number;
}

export class WorkRetriever {
  /**
   * Retrieve work chunks (commits, PRs, issues) relevant to historical/decision queries
   *
   * Strategy:
   * 1. Semantic search via Pinecone (work domain only)
   * 2. Keyword search via PostgreSQL FTS (work domain only)
   * 3. Merge with RRF (70% semantic, 30% keyword)
   * 4. Apply work-specific boosting:
   *    - 2x for <7 days recency
   *    - 2x for label matches
   *    - 1.5x for open state
   *    - 1.5x for summaries over comments
   *    - 1.3x for merged PRs
   */
  async retrieve(
    query: string,
    context: WorkRetrievalContext,
    options: {
      topK?: number;
      maxTokens?: number;
    } = {}
  ): Promise<WorkRetrievalResult> {
    const startTime = Date.now();
    const { topK = 20, maxTokens = 90000 } = options;

    console.log(`[WorkRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      repos: context.repos,
      labels: context.labels,
      state: context.state,
      topK,
    });

    // Step 1: Hybrid search (semantic + keyword)
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, context, topK * 2),
      this.keywordSearch(query, context, topK * 2),
    ]);

    // Step 2: Merge with RRF
    const merged = this.mergeWithRRF(semanticResults, keywordResults);

    // Step 3: Apply work-specific boosting
    const boosted = this.applyWorkBoosting(merged, query);

    // Step 4: Take top K
    const topChunks = boosted.sort((a, b) => b.score - a.score).slice(0, topK);

    // Step 5: Apply token budget
    const { truncatedChunks, truncated, estimatedTokens } = this.applyTokenBudget(
      topChunks,
      maxTokens
    );

    const searchTime = Date.now() - startTime;

    console.log(`[WorkRetriever] Found ${truncatedChunks.length} chunks in ${searchTime}ms`);
    console.log(
      `[WorkRetriever] Estimated tokens: ${estimatedTokens} / ${maxTokens} (truncated: ${truncated})`
    );

    return {
      chunks: truncatedChunks,
      totalChunks: topChunks.length,
      searchTime,
      truncated,
      estimatedTokens,
    };
  }

  /**
   * Semantic search via Pinecone (work domain only)
   */
  private async semanticSearch(
    query: string,
    context: WorkRetrievalContext,
    limit: number
  ): Promise<WorkChunk[]> {
    const [embedding] = await embeddingService.embedTexts([query]);

    // Build Pinecone filter - WORK DOMAIN ONLY
    const filter: Record<string, any> = {
      source: "github",
      chunk_type: {
        $in: ["commit_summary", "pr_summary", "issue_summary", "pr_comments", "issue_comments"],
      },
    };

    // Add context filters
    if (context.repos) filter.repo_full_name = { $in: context.repos };
    if (context.areas) filter.area = { $in: context.areas };
    if (context.labels && context.labels.length > 0) {
      filter.labels = { $in: context.labels };
    }
    if (context.state && context.state !== "all") {
      filter.state = context.state;
    }
    if (context.authors) {
      filter.git_author = { $in: context.authors };
    }
    if (context.dateRange?.start) {
      filter.committed_at = { $gte: context.dateRange.start.toISOString() };
    }

    // Include/exclude comment windows
    if (context.includeComments === false) {
      filter.chunk_type = { $in: ["commit_summary", "pr_summary", "issue_summary"] };
    }

    console.log(`[WorkRetriever] Pinecone filter:`, JSON.stringify(filter));

    // Query Pinecone
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);

    console.log(`[WorkRetriever] Semantic search: ${results.length} chunks`);

    return results.map((r) => this.transformToWorkChunk(r));
  }

  /**
   * Keyword search via PostgreSQL FTS (work domain only)
   */
  private async keywordSearch(
    query: string,
    context: WorkRetrievalContext,
    limit: number
  ): Promise<WorkChunk[]> {
    const conditions = [
      eq(searchContent.source, "github"),
      // Work domain only
      sql`${searchContent.sourceType} IN ('commit_summary', 'pr_summary', 'issue_summary', 'pr_comments', 'issue_comments')`,
    ];

    // Add context filters
    if (context.repos && context.repos.length > 0) {
      conditions.push(
        sql`${searchContent.repoFullName} = ANY(ARRAY[${sql.join(
          context.repos.map((r) => sql.raw(`'${r}'`)),
          sql`, `
        )}])`
      );
    }
    if (context.areas && context.areas.length > 0) {
      conditions.push(
        sql`${searchContent.area} = ANY(ARRAY[${sql.join(
          context.areas.map((a) => sql.raw(`'${a}'`)),
          sql`, `
        )}])`
      );
    }
    if (context.dateRange?.start) {
      conditions.push(gte(searchContent.committedAt, context.dateRange.start));
    }

    const results = await db
      .select()
      .from(searchContent)
      .where(
        and(...conditions, sql`${searchContent.textVector} @@ plainto_tsquery('english', ${query})`)
      )
      .orderBy(
        desc(sql`ts_rank(${searchContent.textVector}, plainto_tsquery('english', ${query}))`)
      )
      .limit(limit);

    console.log(`[WorkRetriever] Keyword: ${results.length} results`);

    return results.map((r) => ({
      id: r.id,
      score: 0.5,
      text: r.text || "",
      repoFullName: r.repoFullName || "unknown",
      chunkType: r.sourceType || "unknown",
      area: r.area || undefined,
      committedAt: r.committedAt?.toISOString() || "",
      author: r.gitAuthor || "",
    }));
  }

  /**
   * Merge semantic + keyword with RRF
   */
  private mergeWithRRF(semantic: WorkChunk[], keyword: WorkChunk[]): WorkChunk[] {
    const resultsMap = new Map<string, WorkChunk>();

    // RRF formula: score = 0.7 * (1/(60 + semantic_rank)) + 0.3 * (1/(60 + keyword_rank))
    semantic.forEach((chunk, rank) => {
      resultsMap.set(chunk.id, {
        ...chunk,
        score: 0.7 * (1 / (60 + rank)),
      });
    });

    keyword.forEach((chunk, rank) => {
      if (resultsMap.has(chunk.id)) {
        const existing = resultsMap.get(chunk.id)!;
        existing.score += 0.3 * (1 / (60 + rank));
      } else {
        resultsMap.set(chunk.id, {
          ...chunk,
          score: 0.3 * (1 / (60 + rank)),
        });
      }
    });

    return Array.from(resultsMap.values());
  }

  /**
   * Apply work-specific boosting
   *
   * Unlike CodeRetriever, we care about:
   * - Recency (2x for <7 days, 1.5x for <30 days, 1.2x for <90 days)
   * - Labels matching query (2x boost)
   * - Open state (1.5x - often more actionable)
   * - Merged PRs (1.3x - accepted solutions)
   * - Summaries over comments (1.5x - prefer overview first)
   * - Discussion quality (1.2x if many comments)
   */
  private applyWorkBoosting(chunks: WorkChunk[], query: string): WorkChunk[] {
    const queryLower = query.toLowerCase();
    const now = new Date();

    return chunks.map((chunk) => {
      let boost = 1.0;

      // RECENCY BOOST (big deal for work domain)
      if (chunk.committedAt) {
        const ageMs = now.getTime() - new Date(chunk.committedAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        if (ageDays < 7)
          boost *= 2.0; // Last week: 2x
        else if (ageDays < 30)
          boost *= 1.5; // Last month: 1.5x
        else if (ageDays < 90) boost *= 1.2; // Last quarter: 1.2x
      }

      // LABEL MATCH (strong signal for work queries)
      if (chunk.labels && chunk.labels.length > 0) {
        const labelsLower = chunk.labels.map((l) => l.toLowerCase());
        const hasMatchingLabel = labelsLower.some((label) => queryLower.includes(label));
        if (hasMatchingLabel) boost *= 2.0;
      }

      // STATE BOOST (open issues/PRs often more relevant)
      if (chunk.state === "open") boost *= 1.5;
      if (chunk.isMerged) boost *= 1.3; // Merged PRs = accepted solutions

      // SUMMARY > COMMENTS (prefer overview first)
      if (
        chunk.chunkType === "commit_summary" ||
        chunk.chunkType === "pr_summary" ||
        chunk.chunkType === "issue_summary"
      ) {
        boost *= 1.5;
      }

      // DISCUSSION QUALITY (many comments = important)
      if (chunk.commentCount && chunk.commentCount > 5) {
        boost *= 1.2;
      }

      // AREA MATCH (if query mentions an area)
      if (chunk.area) {
        const areaKeywords = ["backend", "frontend", "electron", "database", "services"];
        const queryMentionsArea = areaKeywords.some((keyword) => queryLower.includes(keyword));
        if (queryMentionsArea && queryLower.includes(chunk.area.toLowerCase())) {
          boost *= 1.5;
        }
      }

      return {
        ...chunk,
        score: chunk.score * boost,
      };
    });
  }

  /**
   * Apply token budget to prevent hitting LLM context limits
   */
  private applyTokenBudget(
    chunks: WorkChunk[],
    maxTokens: number
  ): { truncatedChunks: WorkChunk[]; truncated: boolean; estimatedTokens: number } {
    const result: WorkChunk[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const chunk of chunks) {
      // Estimate tokens: chars / 4
      const estimatedTokens = Math.ceil(chunk.text.length / 4);

      if (totalTokens + estimatedTokens > maxTokens) {
        console.log(
          `[WorkRetriever] Token budget reached: ${totalTokens} + ${estimatedTokens} > ${maxTokens}`
        );
        truncated = true;
        break;
      }

      result.push(chunk);
      totalTokens += estimatedTokens;
    }

    return {
      truncatedChunks: result,
      truncated,
      estimatedTokens: totalTokens,
    };
  }

  /**
   * Transform Pinecone result to WorkChunk
   */
  private transformToWorkChunk(result: any): WorkChunk {
    return {
      id: result.id,
      score: result.score,
      text: result.metadata.text || "",
      repoFullName: result.metadata.repo_full_name || "unknown",
      chunkType: result.metadata.chunk_type || "unknown",
      area: result.metadata.area,
      committedAt: result.metadata.committed_at || "",
      author: result.metadata.git_author || result.metadata.author || "",
      labels: result.metadata.labels,
      state: result.metadata.state,
      isMerged: result.metadata.is_merged,
      commentCount: result.metadata.comment_count,
    };
  }
}

export const workRetriever = new WorkRetriever();
