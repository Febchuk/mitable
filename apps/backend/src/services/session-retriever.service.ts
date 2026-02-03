/**
 * Session Retriever Service
 *
 * RAG retrieval for session chunks - queries session_chunks table with vector similarity.
 * Completely separate from knowledge agent domain (which uses search_content).
 *
 * Use cases:
 * - Document generation from session data
 * - Session search and discovery
 * - Timeline reconstruction
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { sql, eq, and, inArray, or } from "drizzle-orm";
import { embeddingService } from "./embedding.service.js";
import { SessionIngestionService } from "./session-ingestion.service.js";

export interface SessionChunkResult {
  chunkId: string;
  sessionId: string;
  sessionName: string | null;
  chunkType: "classifier" | "storyteller_summary" | "storyteller_timeline";
  chunkIndex: number;
  text: string;
  metadata: {
    entities?: {
      people?: string[];
      systems?: string[];
    };
    timeRange?: {
      start: string;
      end: string;
    };
    activityCount?: number;
    eventTypes?: string[];
    [key: string]: any;
  };
  similarity: number;
}

export interface SessionSearchParams {
  query: string;
  organizationId: string;
  userId: string; // REQUIRED: Filter to user's sessions only (prevents data leakage)
  sessionIds?: string[]; // Filter to specific sessions
  chunkTypes?: Array<"classifier" | "storyteller_summary" | "storyteller_timeline">; // Filter by chunk type
  dateRange?: { start: Date; end: Date }; // Filter sessions by date range
  topK?: number;
  minSimilarity?: number;
}

export interface SessionSearchResult {
  chunks: SessionChunkResult[];
  sessionMap: Map<string, SessionChunkResult[]>; // Group chunks by session
  sessionsBeingIndexed?: number; // Count of sessions triggered for lazy ingestion
}

class SessionRetrieverService {
  /**
   * Search session chunks by semantic similarity
   */
  async search(params: SessionSearchParams): Promise<SessionSearchResult> {
    const {
      query,
      organizationId,
      userId,
      sessionIds,
      chunkTypes,
      dateRange,
      topK = 20,
      minSimilarity = 0.3, // Lower default for better recall
    } = params;

    console.log(`[SessionRetriever] Searching sessions for query: "${query.substring(0, 50)}..."`);
    console.log(`[SessionRetriever] Filtering to userId: ${userId}`);
    if (dateRange) {
      console.log(
        `[SessionRetriever] Date range: ${dateRange.start.toISOString()} to ${dateRange.end.toISOString()}`
      );
    }

    // LAZY INGESTION: Check for sessions that need ingestion before searching
    const sessionsBeingIndexed = await this.lazyIngestSessions({
      userId,
      organizationId,
      sessionIds,
      dateRange,
    });

    // Generate query embedding
    const queryEmbedding = await embeddingService.embedText(query);

    // Build SQL conditions - CRITICAL: Filter by userId to prevent data leakage
    const conditions = [
      eq(schema.sessionChunks.organizationId, organizationId),
      eq(schema.monitoringSessions.userId, userId), // Prevent cross-user data access
    ];

    if (sessionIds && sessionIds.length > 0) {
      conditions.push(inArray(schema.sessionChunks.sessionId, sessionIds));
    }

    if (chunkTypes && chunkTypes.length > 0) {
      conditions.push(inArray(schema.sessionChunks.chunkType, chunkTypes));
    }

    // Add date range filter on monitoring_sessions
    if (dateRange) {
      conditions.push(
        sql`${schema.monitoringSessions.startedAt} >= ${dateRange.start}`,
        sql`${schema.monitoringSessions.startedAt} <= ${dateRange.end}`
      );
    }

    // Vector similarity search
    const results = await db
      .select({
        chunkId: schema.sessionChunks.id,
        sessionId: schema.sessionChunks.sessionId,
        sessionName: schema.monitoringSessions.name,
        sessionStartedAt: schema.monitoringSessions.startedAt,
        chunkType: schema.sessionChunks.chunkType,
        chunkIndex: schema.sessionChunks.chunkIndex,
        text: schema.sessionChunks.text,
        metadata: schema.sessionChunks.metadata,
        similarity: sql<number>`1 - (${schema.sessionChunks.embedding} <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`})`,
      })
      .from(schema.sessionChunks)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionChunks.sessionId, schema.monitoringSessions.id)
      )
      .where(and(...conditions))
      .orderBy(
        sql`${schema.sessionChunks.embedding} <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}`
      )
      .limit(topK);

    // Filter by minimum similarity
    const chunks = results
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => ({
        chunkId: r.chunkId,
        sessionId: r.sessionId,
        sessionName: r.sessionName,
        chunkType: r.chunkType as any,
        chunkIndex: r.chunkIndex,
        text: r.text,
        metadata: r.metadata as any,
        similarity: r.similarity,
      }));

    console.log(
      `[SessionRetriever] Found ${chunks.length} chunks from ${new Set(chunks.map((c) => c.sessionId)).size} sessions`
    );

    // Group by session
    const sessionMap = new Map<string, SessionChunkResult[]>();
    for (const chunk of chunks) {
      if (!sessionMap.has(chunk.sessionId)) {
        sessionMap.set(chunk.sessionId, []);
      }
      sessionMap.get(chunk.sessionId)!.push(chunk);
    }

    return {
      chunks,
      sessionMap,
      sessionsBeingIndexed: sessionsBeingIndexed > 0 ? sessionsBeingIndexed : undefined,
    };
  }

  /**
   * Get all chunks for specific sessions
   * Used for document generation when session IDs are already known
   */
  async getSessionChunks(
    sessionIds: string[],
    organizationId: string,
    chunkTypes?: Array<"classifier" | "storyteller_summary" | "storyteller_timeline">
  ): Promise<SessionSearchResult> {
    console.log(`[SessionRetriever] Fetching chunks for ${sessionIds.length} sessions`);

    const conditions = [
      eq(schema.sessionChunks.organizationId, organizationId),
      inArray(schema.sessionChunks.sessionId, sessionIds),
    ];

    if (chunkTypes && chunkTypes.length > 0) {
      conditions.push(inArray(schema.sessionChunks.chunkType, chunkTypes));
    }

    const results = await db
      .select({
        chunkId: schema.sessionChunks.id,
        sessionId: schema.sessionChunks.sessionId,
        sessionName: schema.monitoringSessions.name,
        chunkType: schema.sessionChunks.chunkType,
        chunkIndex: schema.sessionChunks.chunkIndex,
        text: schema.sessionChunks.text,
        metadata: schema.sessionChunks.metadata,
      })
      .from(schema.sessionChunks)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionChunks.sessionId, schema.monitoringSessions.id)
      )
      .where(and(...conditions))
      .orderBy(
        schema.sessionChunks.sessionId,
        schema.sessionChunks.chunkType,
        schema.sessionChunks.chunkIndex
      );

    const chunks = results.map((r) => ({
      chunkId: r.chunkId,
      sessionId: r.sessionId,
      sessionName: r.sessionName,
      chunkType: r.chunkType as any,
      chunkIndex: r.chunkIndex,
      text: r.text,
      metadata: r.metadata as any,
      similarity: 1.0, // No similarity score for direct fetch
    }));

    console.log(`[SessionRetriever] Fetched ${chunks.length} chunks`);

    // Group by session
    const sessionMap = new Map<string, SessionChunkResult[]>();
    for (const chunk of chunks) {
      if (!sessionMap.has(chunk.sessionId)) {
        sessionMap.set(chunk.sessionId, []);
      }
      sessionMap.get(chunk.sessionId)!.push(chunk);
    }

    return { chunks, sessionMap };
  }

  /**
   * Build document generation context from session chunks
   * Formats chunks into a structured prompt context
   */
  buildDocumentContext(sessionMap: Map<string, SessionChunkResult[]>): string {
    const sections: string[] = [];

    for (const chunks of sessionMap.values()) {
      const sessionName = chunks[0]?.sessionName || "Unnamed Session";
      const timeRange = this.extractTimeRange(chunks);

      sections.push(`\n## Session: ${sessionName}`);
      if (timeRange) {
        sections.push(`Time: ${timeRange.start} - ${timeRange.end}`);
      }
      sections.push("");

      // Add storyteller summary first (narrative)
      const summaryChunks = chunks.filter((c) => c.chunkType === "storyteller_summary");
      if (summaryChunks.length > 0) {
        sections.push("### Summary");
        summaryChunks.forEach((chunk) => {
          sections.push(chunk.text);
        });
        sections.push("");
      }

      // Add classifier chunks (detailed activities)
      const classifierChunks = chunks.filter((c) => c.chunkType === "classifier");
      if (classifierChunks.length > 0) {
        sections.push("### Activity Timeline");
        classifierChunks.forEach((chunk) => {
          sections.push(chunk.text);
          sections.push("");
        });
      }
    }

    return sections.join("\n");
  }

  /**
   * Extract time range from chunks
   */
  private extractTimeRange(chunks: SessionChunkResult[]): { start: string; end: string } | null {
    const timeRanges = chunks
      .map((c) => c.metadata.timeRange)
      .filter((t): t is { start: string; end: string } => !!t);

    if (timeRanges.length === 0) return null;

    const starts = timeRanges.map((t) => new Date(t.start).getTime());
    const ends = timeRanges.map((t) => new Date(t.end).getTime());

    return {
      start: new Date(Math.min(...starts)).toISOString(),
      end: new Date(Math.max(...ends)).toISOString(),
    };
  }

  /**
   * Lazy Ingestion: Auto-trigger ingestion for sessions that are ready but not yet chunked
   *
   * This prevents errors when querying for document generation and ensures sessions
   * are automatically indexed on-demand. Deduplication is handled by SessionIngestionService.
   *
   * Returns the count of sessions being ingested for progress feedback.
   */
  private async lazyIngestSessions(params: {
    userId: string;
    organizationId: string;
    sessionIds?: string[];
    dateRange?: { start: Date; end: Date };
  }): Promise<number> {
    const { userId, organizationId, sessionIds, dateRange } = params;

    try {
      // Build query conditions
      const conditions = [
        eq(schema.monitoringSessions.userId, userId),
        eq(schema.monitoringSessions.organizationId, organizationId),
        or(
          eq(schema.monitoringSessions.status, "ready"),
          eq(schema.monitoringSessions.status, "ended")
        ),
        or(
          eq(schema.monitoringSessions.ingestionStatus, "pending"),
          eq(schema.monitoringSessions.ingestionStatus, "failed")
        ),
      ];

      if (sessionIds && sessionIds.length > 0) {
        conditions.push(inArray(schema.monitoringSessions.id, sessionIds));
      }

      if (dateRange) {
        conditions.push(
          sql`${schema.monitoringSessions.startedAt} >= ${dateRange.start}`,
          sql`${schema.monitoringSessions.startedAt} <= ${dateRange.end}`
        );
      }

      // Find sessions that need ingestion
      const needsIngestion = await db
        .select({ id: schema.monitoringSessions.id })
        .from(schema.monitoringSessions)
        .where(and(...conditions))
        .limit(10); // Limit to prevent overwhelming the system

      if (needsIngestion.length > 0) {
        console.log(
          `[SessionRetriever] Found ${needsIngestion.length} sessions needing ingestion - triggering lazy ingestion`
        );

        // Trigger ingestion asynchronously (fire and forget)
        // Don't await - let it run in background
        for (const session of needsIngestion) {
          SessionIngestionService.ingestSession(session.id)
            .then(async (result) => {
              if (result.success) {
                // Update ingestion status to completed
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "completed" })
                  .where(eq(schema.monitoringSessions.id, session.id));
                console.log(
                  `[SessionRetriever] ✅ Lazy ingestion completed for session ${session.id}`
                );
              } else {
                // Update ingestion status to failed
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "failed" })
                  .where(eq(schema.monitoringSessions.id, session.id));
                console.log(
                  `[SessionRetriever] ❌ Lazy ingestion failed for session ${session.id}: ${result.error}`
                );
              }
            })
            .catch(async (error) => {
              // Update ingestion status to failed on exception
              await db
                .update(schema.monitoringSessions)
                .set({ ingestionStatus: "failed" })
                .where(eq(schema.monitoringSessions.id, session.id));
              console.error(
                `[SessionRetriever] ❌ Lazy ingestion error for session ${session.id}:`,
                error
              );
            });
        }

        console.log(
          `[SessionRetriever] Note: ${needsIngestion.length} sessions are being ingested in background - they may not appear in this search result yet`
        );
        return needsIngestion.length;
      }

      return 0;
    } catch (error) {
      // Don't throw - lazy ingestion is best-effort
      console.error("[SessionRetriever] Lazy ingestion check failed:", error);
      return 0;
    }
  }
}

export const sessionRetrieverService = new SessionRetrieverService();
