/**
 * CodeRetriever - Domain-specific retrieval for codebase search
 * 
 * Purpose: Find code files, symbols, and implementations
 * 
 * Priorities (different from knowledge search):
 * 1. Exact matches matter MORE - function names, class names, file paths
 * 2. Path structure is critical - apps/electron/src/main/tray.ts tells you a lot
 * 3. Recency matters LESS - old code is often still the right answer
 * 4. Group by file/symbol - not by thread or conversation
 * 5. Language/area context - TypeScript vs Python, electron-main vs backend-api
 * 
 * This is a FOCUSED, single-purpose module - no Slack threads, no temporal queries,
 * no trust ranking. Just clean code search.
 */

import { vectorService } from "../services/vector.service.js";
import { embeddingService } from "../services/embedding.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/search-content.schema.js";
import { eq, and, sql, desc } from "drizzle-orm";

export interface CodeRetrievalContext {
  organizationId: string;
  repoId?: string;        // Optional: filter to specific repo
  repoFullName?: string;  // Optional: filter by repo name
  area?: string;          // Optional: filter by area (electron-main, backend-api, etc.)
  language?: string;      // Optional: filter by language (typescript, python, etc.)
  path?: string;          // Optional: filter by file path pattern
}

export interface CodeChunk {
  id: string;
  score: number;
  text: string;
  
  // File context
  path: string;
  fileName: string;
  language: string;
  startLine: number;
  endLine: number;
  
  // Repo context
  repoId: string;
  repoFullName: string;
  area?: string;
  
  // Git context
  commitSha: string;
  author: string;
  committedAt: string;
}

export interface CodeFile {
  path: string;
  fileName: string;
  language: string;
  area?: string;
  repoFullName: string;
  chunks: CodeChunk[];
  topScore: number;
}

export interface CodeRetrievalResult {
  files: CodeFile[];
  totalChunks: number;
  searchTime: number;
}

export class CodeRetriever {
  /**
   * Retrieve code chunks relevant to the query
   * 
   * Strategy:
   * 1. Semantic search via Pinecone (code embeddings)
   * 2. Keyword search via PostgreSQL FTS (exact token matches)
   * 3. Boost exact matches for function names, paths
   * 4. Group results by file
   * 5. Return structured file-based results
   */
  async retrieve(
    query: string,
    context: CodeRetrievalContext,
    options: {
      topK?: number;
      includeTypes?: ("code" | "commit" | "pr" | "issue")[];
    } = {}
  ): Promise<CodeRetrievalResult> {
    const startTime = Date.now();
    const { topK = 20, includeTypes = ["code"] } = options;
    
    console.log(`[CodeRetriever] Searching for: "${query}"`, {
      organizationId: context.organizationId,
      repoId: context.repoId,
      area: context.area,
      language: context.language,
      topK,
      includeTypes,
    });

    // Step 1: Semantic search via Pinecone
    const semanticResults = await this.semanticSearch(query, context, topK * 2, includeTypes);
    
    // Step 2: Keyword search via PostgreSQL
    const keywordResults = await this.keywordSearch(query, context, topK * 2);
    
    // Step 3: Merge and boost exact matches
    const mergedResults = this.mergeAndBoost(query, semanticResults, keywordResults, topK);
    
    // Step 4: Group by file
    const files = this.groupByFile(mergedResults);
    
    const searchTime = Date.now() - startTime;
    
    console.log(`[CodeRetriever] Found ${files.length} files with ${mergedResults.length} chunks in ${searchTime}ms`);
    
    return {
      files,
      totalChunks: mergedResults.length,
      searchTime,
    };
  }

  /**
   * Semantic search via Pinecone
   */
  private async semanticSearch(
    query: string,
    context: CodeRetrievalContext,
    limit: number,
    includeTypes: ("code" | "commit" | "pr" | "issue")[] = ["code"]
  ): Promise<CodeChunk[]> {
    // Generate embedding
    const [embedding] = await embeddingService.embedTexts([query]);
    
    // Build Pinecone filter to scope search BEFORE retrieval
    const filter: Record<string, any> = {
      source: "github",
    };
    
    // Add type filter (code OR commit OR pr OR issue)
    if (includeTypes.length === 1) {
      filter.type = includeTypes[0];
    } else {
      filter.type = { $in: includeTypes };
    }
    
    // Add optional context filters
    if (context.repoId) filter.repo_id = context.repoId;
    if (context.repoFullName) filter.repo_full_name = context.repoFullName;
    if (context.area) filter.area = context.area;
    if (context.language) filter.language = context.language;
    
    console.log(`[CodeRetriever] Pinecone filter:`, JSON.stringify(filter));
    
    // Query Pinecone WITH METADATA FILTER (scoped BEFORE ranking)
    const namespace = `org-${context.organizationId}`;
    const results = await vectorService.queryVectors(embedding, limit, namespace, filter);
    
    console.log(`[CodeRetriever] Semantic search: ${results.length} code chunks (filtered at query time)`);
    
    // Transform to CodeChunk
    return results.map((result) => ({
      id: result.id,
      score: result.score,
      text: result.metadata.text || "",
      path: result.metadata.path || "",
      fileName: result.metadata.file_name || "",
      language: result.metadata.language || "",
      startLine: result.metadata.start_line || 0,
      endLine: result.metadata.end_line || 0,
      repoId: result.metadata.repo_id || "",
      repoFullName: result.metadata.repo_full_name || "",
      area: result.metadata.area,
      commitSha: result.metadata.commit_sha || "",
      author: result.metadata.author || "",
      committedAt: result.metadata.committed_at || "",
    }));
  }

  /**
   * Keyword search via PostgreSQL FTS
   */
  private async keywordSearch(
    query: string,
    _context: CodeRetrievalContext, // Unused: PostgreSQL search_content lacks GitHub-specific metadata columns
    limit: number
  ): Promise<CodeChunk[]> {
    // Build where conditions
    // Note: search_content doesn't have GitHub-specific metadata columns yet
    // We only filter by source and sourceType
    const conditions = [
      eq(searchContent.source, "github"),
      eq(searchContent.sourceType, "code"),
    ];
    
    // FTS query
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
    
    console.log(`[CodeRetriever] Keyword search: ${results.length} results`);
    
    // Transform to CodeChunk
    // Note: search_content only has basic fields, rich metadata is in Pinecone
    // For code search, we prioritize Pinecone which has full metadata
    return results.map((result) => ({
      id: result.id,
      score: 0.5, // Default keyword score, will be adjusted in merge
      text: result.text || "",
      // These will be empty from Postgres, will be filled from Pinecone in merge
      path: "",
      fileName: "",
      language: "",
      startLine: 0,
      endLine: 0,
      repoId: "",
      repoFullName: "",
      area: undefined,
      commitSha: "",
      author: "",
      committedAt: "",
    }));
  }

  /**
   * Merge semantic + keyword results with exact match boosting
   * 
   * Code-specific boosting:
   * - Exact file name match: 2.0x
   * - Exact function/class name match: 1.8x
   * - Path contains query: 1.5x
   * - Language match preference: 1.2x
   */
  private mergeAndBoost(
    query: string,
    semanticResults: CodeChunk[],
    keywordResults: CodeChunk[],
    topK: number
  ): CodeChunk[] {
    // Combine results (deduplicate by ID)
    const resultsMap = new Map<string, CodeChunk>();
    
    // Add semantic results
    semanticResults.forEach((chunk) => {
      resultsMap.set(chunk.id, { ...chunk, score: chunk.score * 0.7 }); // 70% semantic weight
    });
    
    // Merge keyword results
    keywordResults.forEach((chunk) => {
      if (resultsMap.has(chunk.id)) {
        // Boost if found in both
        const existing = resultsMap.get(chunk.id)!;
        existing.score += 0.3; // 30% keyword weight
      } else {
        resultsMap.set(chunk.id, { ...chunk, score: chunk.score * 0.3 });
      }
    });
    
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/);
    
    // Apply code-specific boosts
    const boosted = Array.from(resultsMap.values()).map((chunk) => {
      let boost = 1.0;
      
      // Exact file name match
      if (chunk.fileName.toLowerCase().includes(queryLower)) {
        boost *= 2.0;
      }
      
      // Path contains query
      if (chunk.path.toLowerCase().includes(queryLower)) {
        boost *= 1.5;
      }
      
      // Check for function/class name matches in the code text
      // Look for patterns like "function queryTerm" or "class QueryTerm"
      const textLower = chunk.text.toLowerCase();
      queryTokens.forEach((token) => {
        if (token.length > 3) {
          const patterns = [
            new RegExp(`\\bfunction\\s+${token}\\b`, "i"),
            new RegExp(`\\bclass\\s+${token}\\b`, "i"),
            new RegExp(`\\bconst\\s+${token}\\s*=`, "i"),
            new RegExp(`\\bexport\\s+(function|class|const)\\s+${token}\\b`, "i"),
          ];
          
          if (patterns.some((p) => p.test(textLower))) {
            boost *= 1.8;
          }
        }
      });
      
      return {
        ...chunk,
        score: chunk.score * boost,
      };
    });
    
    // Sort by score and take topK
    return boosted.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Group chunks by file and sort files by top chunk score
   */
  private groupByFile(chunks: CodeChunk[]): CodeFile[] {
    const fileMap = new Map<string, CodeFile>();
    
    chunks.forEach((chunk) => {
      if (!fileMap.has(chunk.path)) {
        fileMap.set(chunk.path, {
          path: chunk.path,
          fileName: chunk.fileName,
          language: chunk.language,
          area: chunk.area,
          repoFullName: chunk.repoFullName,
          chunks: [],
          topScore: 0,
        });
      }
      
      const file = fileMap.get(chunk.path)!;
      file.chunks.push(chunk);
      file.topScore = Math.max(file.topScore, chunk.score);
    });
    
    // Sort chunks within each file by line number
    fileMap.forEach((file) => {
      file.chunks.sort((a, b) => a.startLine - b.startLine);
    });
    
    // Sort files by top score
    return Array.from(fileMap.values()).sort((a, b) => b.topScore - a.topScore);
  }
}

export const codeRetriever = new CodeRetriever();
