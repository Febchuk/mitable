/**
 * Context Service
 *
 * Thin orchestration layer for agent context tools.
 * Delegates to existing services — no new AI calls.
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import { sessionRetrieverService } from "./session-retriever.service.js";
import { searchService } from "./search.service.js";

export interface ContextSearchParams {
  query: string;
  userId: string;
  organizationId: string;
  days?: number;
  topK?: number;
}

export interface ContextSearchResult {
  chunks: Array<{
    text: string;
    sessionId: string;
    sessionName: string | null;
    chunkType: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
  totalResults: number;
}

export interface CurrentActivityResult {
  activeSession: {
    id: string;
    name: string | null;
    status: string;
    startedAt: Date;
  } | null;
  recentActivity: string | null;
}

export interface KnowledgeSearchParams {
  query: string;
  organizationId: string;
  sources?: string[];
}

export interface KnowledgeSearchResult {
  results: Array<{
    id: string;
    text: string;
    source: string;
    score: number;
    channelName?: string;
    pageTitle?: string;
  }>;
  totalResults: number;
}

class ContextService {
  /**
   * Semantic search across session_chunks (pgvector cosine similarity)
   */
  async search(params: ContextSearchParams): Promise<ContextSearchResult> {
    const { query, userId, organizationId, days, topK = 20 } = params;

    let dateRange: { start: Date; end: Date } | undefined;
    if (days) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      dateRange = { start, end };
    }

    const result = await sessionRetrieverService.search({
      query,
      organizationId,
      userId,
      topK,
      dateRange,
    });

    return {
      chunks: result.chunks.map((chunk) => ({
        text: chunk.text,
        sessionId: chunk.sessionId,
        sessionName: chunk.sessionName,
        chunkType: chunk.chunkType,
        similarity: chunk.similarity,
        metadata: chunk.metadata,
      })),
      totalResults: result.chunks.length,
    };
  }

  /**
   * Get current/recent activity for the user
   */
  async getCurrentActivity(
    userId: string,
    organizationId: string
  ): Promise<CurrentActivityResult> {
    // Find most recent active or recently ended session
    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        status: schema.monitoringSessions.status,
        startedAt: schema.monitoringSessions.startedAt,
      })
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.organizationId, organizationId)
        )
      )
      .orderBy(desc(schema.monitoringSessions.startedAt))
      .limit(1);

    const activeSession = sessions[0]
      ? {
          id: sessions[0].id,
          name: sessions[0].name,
          status: sessions[0].status,
          startedAt: sessions[0].startedAt,
        }
      : null;

    return {
      activeSession,
      recentActivity: activeSession?.name || null,
    };
  }

  /**
   * Search integrated knowledge sources (Slack, Notion, GitHub)
   */
  async searchKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeSearchResult> {
    const { query, organizationId, sources } = params;

    const result = await searchService.search({
      query,
      organizationId,
      filters: sources?.length
        ? { sources: sources as ("slack" | "notion")[] }
        : undefined,
      topK: 20,
    });

    return {
      results: result.results.map((r) => ({
        id: r.id,
        text: r.text,
        source: r.source,
        score: r.score,
        channelName: r.channelName,
        pageTitle: r.pageTitle,
      })),
      totalResults: result.totalResults,
    };
  }
}

export const contextService = new ContextService();
