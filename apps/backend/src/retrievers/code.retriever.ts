/**
 * CodeRetriever - Domain-specific retrieval for code repositories
 *
 * Purpose: Find relevant code (functions, classes, files) from GitHub repositories
 *
 * Priorities (different from Slack and Notion):
 * 1. Exact symbol matches are CRITICAL - boost function/class names heavily
 * 2. File role matters - prefer services/controllers over tests/configs
 * 3. Area filtering - search only relevant parts of codebase
 * 4. Recency matters LESS than Slack (old code is often correct)
 * 5. Code structure - file_overview for "where?" questions, symbols for "how?"
 *
 * This is FOCUSED on code's structural nature.
 */

import { embeddingService } from "../domains/shared-infra/services/embedding.service.js";
import { vectorService } from "../domains/shared-infra/services/vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql, and, eq, desc } from "drizzle-orm";

export interface CodeRetrievalContext {
  organizationId: string;
  repos?: string[]; // Filter to specific repos
  areas?: string[]; // Filter by area (backend-services, electron-main, etc.)
  languages?: string[]; // Filter by language
  fileRoles?: string[]; // Filter by role (service, controller, component, etc.)
  includeTests?: boolean; // Include test files (default: false)
  chunkTypes?: string[]; // Filter by chunk type (file_overview, function, class, etc.)
}

export interface CodeChunk {
  id: string;
  score: number;
  text: string;

  // Code context
  repoFullName: string;
  path: string;
  fileName: string;
  language: string;
  fileRole: string;
  area?: string;

  // Symbol info
  chunkType: string;
  functionName?: string;
  className?: string;
  startLine: number;
  endLine: number;
  isExported?: boolean;

  // Git context
  commitSha: string;
  author: string;
  committedAt: string;
}

export interface CodeRetrievalResult {
  chunks: CodeChunk[];
  totalChunks: number;
  searchTime: number;
  truncated: boolean;
  estimatedTokens: number;
}

export class CodeRetriever {
  /**
   * Retrieve code chunks relevant to the query
   *
   * Strategy:
   * 1. Semantic search via Pinecone
   * 2. Keyword search via PostgreSQL FTS
   * 3. Merge with RRF (70% semantic, 30% keyword)
   * 4. Boost exact symbol name matches (2x)
   * 5. Boost file_overview for architectural questions
   * 6. Downweight tests and configs unless explicitly requested
   */
  async retrieve(
    query: string,
    context: CodeRetrievalContext,
    options: {
      topK?: number;
      maxTokens?: number;
    } = {}
  ): Promise<CodeRetrievalResult> {
    const startTime = Date.now();
    const { topK = 20, maxTokens = 90000 } = options;

    console.log(`[CodeRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      repos: context.repos,
      areas: context.areas,
      topK,
    });

    // Step 1: Hybrid search (semantic + keyword)
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(query, context, topK * 2),
      this.keywordSearch(query, context, topK * 2),
    ]);

    // Step 2: Merge with RRF
    const merged = this.mergeWithRRF(semanticResults, keywordResults);

    // Step 3: Apply code-specific boosting
    const boosted = this.applyCodeBoosting(merged, query);

    // Log top boosted results to show code prioritization
    const topBoosted = boosted.sort((a, b) => b.score - a.score).slice(0, 5);
    console.log(`[CodeRetriever] Top 5 after boosting:`);
    topBoosted.forEach((chunk, i) => {
      const fileType = chunk.path.match(/\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)$/i)
        ? "CODE"
        : chunk.path.match(/\.md$/i)
          ? "DOCS"
          : "OTHER";
      console.log(`  ${i + 1}. [${fileType}] ${chunk.path} (score: ${chunk.score.toFixed(4)})`);
    });

    // Step 4: Filter out tests/configs unless explicitly requested
    const filtered = this.filterByContext(boosted, context);

    // Step 5: Take top K
    const topChunks = filtered.sort((a, b) => b.score - a.score).slice(0, topK);

    // Step 6: Apply token budget
    const { truncatedChunks, truncated, estimatedTokens } = this.applyTokenBudget(
      topChunks,
      maxTokens
    );

    const searchTime = Date.now() - startTime;

    console.log(`[CodeRetriever] Found ${truncatedChunks.length} chunks in ${searchTime}ms`);
    console.log(
      `[CodeRetriever] Estimated tokens: ${estimatedTokens} / ${maxTokens} (truncated: ${truncated})`
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
   * Semantic search via Pinecone
   */
  private async semanticSearch(
    query: string,
    context: CodeRetrievalContext,
    limit: number
  ): Promise<CodeChunk[]> {
    const [embedding] = await embeddingService.embedTexts([query]);

    // Build Pinecone filter
    const filter: Record<string, any> = {
      source: "github",
      chunk_type: { $nin: ["commit_summary", "pr_summary", "issue_summary"] }, // Code domain only
    };

    // Add context filters
    if (context.repos) filter.repo_full_name = { $in: context.repos };
    if (context.areas) filter.area = { $in: context.areas };
    if (context.languages) filter.language = { $in: context.languages };
    if (context.fileRoles) filter.file_role = { $in: context.fileRoles };
    if (context.chunkTypes) filter.chunk_type = { $in: context.chunkTypes };

    // Exclude tests by default
    if (!context.includeTests) {
      filter.is_test_file = false;
    }

    console.log(`[CodeRetriever] Pinecone filter:`, JSON.stringify(filter));

    // Query Pinecone
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);

    console.log(`[CodeRetriever] Semantic search: ${results.length} chunks`);

    return results.map((r) => this.transformToCodeChunk(r));
  }

  /**
   * Keyword search via PostgreSQL FTS
   */
  private async keywordSearch(
    query: string,
    context: CodeRetrievalContext,
    limit: number
  ): Promise<CodeChunk[]> {
    const conditions = [
      eq(searchContent.source, "github"),
      // Exclude work domain chunks
      sql`${searchContent.sourceType} NOT IN ('commit_summary', 'pr_summary', 'issue_summary')`,
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
    if (context.languages && context.languages.length > 0) {
      conditions.push(
        sql`${searchContent.language} = ANY(ARRAY[${sql.join(
          context.languages.map((l) => sql.raw(`'${l}'`)),
          sql`, `
        )}])`
      );
    }
    if (!context.includeTests) {
      conditions.push(eq(searchContent.isTestFile, false));
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

    console.log(`[CodeRetriever] Keyword: ${results.length} results`);

    return results.map((r) => ({
      id: r.id,
      score: 0.5,
      text: r.text || "",
      repoFullName: r.repoFullName || "unknown",
      path: r.filePath || "",
      fileName: r.fileName || "unknown",
      language: r.language || "unknown",
      fileRole: r.fileRole || "other",
      area: r.area || undefined,
      chunkType: r.sourceType || "unknown",
      functionName: r.functionName || undefined,
      className: r.className || undefined,
      startLine: r.startLine || 0,
      endLine: r.endLine || 0,
      isExported: r.isExported || false,
      commitSha: r.commitSha || "",
      author: r.gitAuthor || "",
      committedAt: r.committedAt?.toISOString() || "",
    }));
  }

  /**
   * Merge semantic + keyword with RRF
   */
  private mergeWithRRF(semantic: CodeChunk[], keyword: CodeChunk[]): CodeChunk[] {
    const resultsMap = new Map<string, CodeChunk>();

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
   * Apply code-specific boosting
   *
   * Unlike Slack (where recency matters), code search prioritizes:
   * - ACTUAL CODE FILES over documentation (5x boost - CODE IS GROUND TRUTH)
   * - Exact symbol name matches
   * - file_overview for "where" questions
   * - Services/controllers over configs/tests
   */
  private applyCodeBoosting(chunks: CodeChunk[], query: string): CodeChunk[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    return chunks.map((chunk) => {
      let boost = 1.0;

      // CRITICAL: Code files are the source of truth - 5x boost over docs
      // Docs can be outdated, but code is what's actually running
      const isCodeFile = chunk.path.match(/\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)$/i);
      const isDocFile = chunk.path.match(/\.md$/i);

      if (isCodeFile) {
        boost *= 5.0; // Holy grail of accuracy
      } else if (isDocFile) {
        boost *= 1.0; // No boost - docs are secondary
      }

      // Boost exact function/class name matches (2x)
      if (chunk.functionName && queryWords.includes(chunk.functionName.toLowerCase())) {
        boost *= 2.0;
      }
      if (chunk.className && queryWords.includes(chunk.className.toLowerCase())) {
        boost *= 2.0;
      }

      // Boost file_overview for "where" questions (1.5x)
      if (
        chunk.chunkType === "file_overview" &&
        (queryLower.includes("where") || queryLower.includes("which file"))
      ) {
        boost *= 1.5;
      }

      // Boost services/controllers (1.3x)
      if (chunk.fileRole === "service" || chunk.fileRole === "controller") {
        boost *= 1.3;
      }

      // Boost exported symbols (1.2x) - more likely to be public API
      if (chunk.isExported) {
        boost *= 1.2;
      }

      // Downweight configs unless query mentions config (0.7x)
      if (chunk.fileRole === "config" && !queryLower.includes("config")) {
        boost *= 0.7;
      }

      return {
        ...chunk,
        score: chunk.score * boost,
      };
    });
  }

  /**
   * Filter chunks by context (exclude tests/configs unless requested)
   */
  private filterByContext(chunks: CodeChunk[], context: CodeRetrievalContext): CodeChunk[] {
    return chunks.filter((chunk) => {
      // If includeTests is false, filter out test files
      if (!context.includeTests && chunk.fileRole === "test") {
        return false;
      }
      return true;
    });
  }

  /**
   * Apply token budget to prevent hitting LLM context limits
   */
  private applyTokenBudget(
    chunks: CodeChunk[],
    maxTokens: number
  ): { truncatedChunks: CodeChunk[]; truncated: boolean; estimatedTokens: number } {
    const result: CodeChunk[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const chunk of chunks) {
      // Estimate tokens: chars / 4
      const estimatedTokens = Math.ceil(chunk.text.length / 4);

      if (totalTokens + estimatedTokens > maxTokens) {
        console.log(
          `[CodeRetriever] Token budget reached: ${totalTokens} + ${estimatedTokens} > ${maxTokens}`
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
   * Transform Pinecone result to CodeChunk
   */
  private transformToCodeChunk(result: any): CodeChunk {
    return {
      id: result.id,
      score: result.score,
      text: result.metadata.text || "",
      repoFullName: result.metadata.repo_full_name || "unknown",
      path: result.metadata.path || "",
      fileName: result.metadata.file_name || "unknown",
      language: result.metadata.language || "unknown",
      fileRole: result.metadata.file_role || "other",
      area: result.metadata.area,
      chunkType: result.metadata.chunk_type || "unknown",
      functionName: result.metadata.function_name,
      className: result.metadata.class_name,
      startLine: result.metadata.start_line || 0,
      endLine: result.metadata.end_line || 0,
      isExported: result.metadata.is_exported,
      commitSha: result.metadata.commit_sha || "",
      author: result.metadata.author || "",
      committedAt: result.metadata.committed_at || "",
    };
  }
}

export const codeRetriever = new CodeRetriever();
