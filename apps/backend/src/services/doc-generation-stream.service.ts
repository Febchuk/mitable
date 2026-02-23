/**
 * Document Generation Stream Service
 *
 * AI-powered document generation from user sessions using RAG + RLM pipeline.
 * Streams progress events via SSE for real-time UI updates.
 *
 * Pipeline:
 * 1. Create document record (status='generating')
 * 2. Use KnowledgeAgent to search sessions via search_content (RAG)
 * 3. Extract session data + RLM environments
 * 4. Generate document content via LLM
 * 5. Update document with content (status='draft')
 *
 * Progress events emitted:
 * - progress: { phase: "indexing_sessions" | "searching_sessions" | "analyzing_data" | "drafting" | "polishing" }
 * - chunk: { content: string }
 * - complete: { content: string, documentId: string }
 * - error: { error: string }
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { DocType } from "@mitable/shared";
import type { StreamChunk } from "../tools/base.tool.js";
import { sessionRetrieverService } from "./session-retriever.service.js";
import { documentGenerationAgent } from "./document-generation/agent.js";
import { createDocumentEnvironment } from "./document-generation/environment.js";
import {
  DOC_GEN_MODEL,
  DOC_GEN_TEMPERATURE,
  DOC_GEN_MAX_TOKENS,
  SESSION_SEARCH_TOP_K,
  SESSION_SEARCH_MIN_SIMILARITY,
} from "./doc-generation-config.js";

const DOC_GEN_CONFIG = {
  TEXT_MODEL: DOC_GEN_MODEL,
  TEMPERATURE: DOC_GEN_TEMPERATURE,
  MAX_TOKENS: DOC_GEN_MAX_TOKENS,
};

interface GenerateStreamParams {
  prompt: string;
  docType: DocType;
  organizationId: string;
  userId: string;
  /** Optional session IDs to prioritize - AI will still search all sessions but these get extra weight */
  sessionIds?: string[];
  /** Optional artifact IDs to include as reference material */
  artifactIds?: string[];
}

interface ProgressEvent {
  type: "progress";
  phase: "indexing_sessions" | "searching_sessions" | "analyzing_data" | "drafting" | "polishing";
  message: string;
}

class DocGenerationStreamService {
  constructor() {
    // Groq client now handled by RLM agent
  }

  /**
   * Generate document from user prompt with streaming progress
   */
  async *generateFromPrompt(
    params: GenerateStreamParams
  ): AsyncIterable<StreamChunk | ProgressEvent> {
    const {
      prompt,
      docType,
      organizationId,
      userId,
      sessionIds: hintSessionIds,
      artifactIds,
    } = params;

    let documentId: string | null = null;

    try {
      // Phase 1: Create document record immediately (status='generating')
      yield {
        type: "progress",
        phase: "searching_sessions",
        message: "Creating document and searching your sessions...",
      } as ProgressEvent;

      const [document] = await db
        .insert(schema.documents)
        .values({
          organizationId,
          createdBy: userId,
          title: `Generating: ${prompt.slice(0, 60)}...`,
          docType,
          content: "",
          status: "draft", // We'll update this with content when done
          generationModel: DOC_GEN_CONFIG.TEXT_MODEL,
          generationPromptVersion: 1,
        })
        .returning();

      documentId = document.id;

      // Phase 2: Search sessions using RAG
      yield {
        type: "progress",
        phase: "searching_sessions",
        message: "Searching through your work sessions...",
      } as ProgressEvent;

      // Parse date range from prompt (e.g., "this week", "last week", "today")
      const dateRange = this.parseDateRangeFromPrompt(prompt);

      if (dateRange) {
        console.log(
          `[DocGenerationStream] Detected date range: ${dateRange.start.toISOString()} to ${dateRange.end.toISOString()}`
        );
      }

      // Use SessionRetriever to find relevant session IDs (filtered to this user only)
      const { sessionMap, sessionsBeingIndexed } = await sessionRetrieverService.search({
        query: prompt,
        organizationId,
        userId, // CRITICAL: Filter to user's sessions only
        dateRange,
        topK: SESSION_SEARCH_TOP_K,
        minSimilarity: SESSION_SEARCH_MIN_SIMILARITY,
      });

      // Emit indexing progress if sessions are being ingested
      if (sessionsBeingIndexed && sessionsBeingIndexed > 0) {
        yield {
          type: "progress",
          phase: "indexing_sessions",
          message: `Indexing ${sessionsBeingIndexed} session${sessionsBeingIndexed > 1 ? "s" : ""} before generation...`,
        } as ProgressEvent;
      }

      let sessionIds = Array.from(sessionMap.keys());
      let sources: Array<{
        type: string;
        sessionId: string;
        sessionName: string;
        chunkCount: number;
      }> = [];
      console.log(`[DocGenerationStream] Found ${sessionIds.length} relevant sessions via RAG`);

      // Hybrid: merge un-indexed sessions from the date range into results.
      // The environment tools have fallbacks to query raw DB data for these.
      if (dateRange) {
        const indexedSet = new Set(sessionIds);
        const unindexedSessions = await db
          .select({
            id: schema.monitoringSessions.id,
            name: schema.monitoringSessions.name,
          })
          .from(schema.monitoringSessions)
          .where(
            and(
              eq(schema.monitoringSessions.organizationId, organizationId),
              eq(schema.monitoringSessions.userId, userId),
              gte(schema.monitoringSessions.startedAt, dateRange.start),
              lte(schema.monitoringSessions.startedAt, dateRange.end),
              sql`${schema.monitoringSessions.status} IN ('ready', 'delivered')`,
              sql`${schema.monitoringSessions.ingestionStatus} != 'completed'`
            )
          )
          .limit(20);

        const newIds = unindexedSessions.filter((s) => !indexedSet.has(s.id));
        if (newIds.length > 0) {
          console.log(
            `[DocGenerationStream] Adding ${newIds.length} un-indexed sessions via hybrid fallback`
          );
          sessionIds.push(...newIds.map((s) => s.id));
        }
      }

      // If hint session IDs provided, prioritize them
      if (hintSessionIds && hintSessionIds.length > 0) {
        console.log(`[DocGenerationStream] Prioritizing ${hintSessionIds.length} hint session(s)`);
        // Add hint sessions to the front (removing duplicates)
        const hintSet = new Set(hintSessionIds);
        const otherSessions = sessionIds.filter((id) => !hintSet.has(id));
        sessionIds = [...hintSessionIds, ...otherSessions];
      }

      // Fallback: If no chunks found but hint sessions provided, use those
      if (sessionIds.length === 0 && hintSessionIds && hintSessionIds.length > 0) {
        console.log(
          `[DocGenerationStream] No chunks found, using ${hintSessionIds.length} hint session(s)`
        );
        sessionIds = hintSessionIds;
      }

      // Fallback: If still no sessions, query raw sessions directly
      if (sessionIds.length === 0) {
        console.log(`[DocGenerationStream] No chunks found, falling back to raw sessions query`);
        console.log(`[DocGenerationStream] Query params: org=${organizationId}, user=${userId}`);
        if (dateRange) {
          console.log(
            `[DocGenerationStream] Date filter: ${dateRange.start.toISOString()} to ${dateRange.end.toISOString()}`
          );
        }

        // First, check total sessions for this user (without date filter)
        const totalUserSessions = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.monitoringSessions)
          .where(
            and(
              eq(schema.monitoringSessions.organizationId, organizationId),
              eq(schema.monitoringSessions.userId, userId)
            )
          );
        console.log(
          `[DocGenerationStream] Total sessions for user (no date filter): ${totalUserSessions[0]?.count}`
        );

        // Also check total captures in database
        const totalCaptures = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.sessionCaptures);
        console.log(`[DocGenerationStream] Total captures in database: ${totalCaptures[0]?.count}`);

        // Build conditions for raw session query
        const conditions = [
          eq(schema.monitoringSessions.organizationId, organizationId),
          eq(schema.monitoringSessions.userId, userId),
        ];

        if (dateRange) {
          conditions.push(gte(schema.monitoringSessions.startedAt, dateRange.start));
          conditions.push(lte(schema.monitoringSessions.startedAt, dateRange.end));
        }

        // Query sessions with capture count using LEFT JOIN
        const rawSessions = await db
          .select({
            id: schema.monitoringSessions.id,
            name: schema.monitoringSessions.name,
            startedAt: schema.monitoringSessions.startedAt,
            captureCount: sql<number>`COALESCE(COUNT(${schema.sessionCaptures.id}), 0)`,
          })
          .from(schema.monitoringSessions)
          .leftJoin(
            schema.sessionCaptures,
            eq(schema.monitoringSessions.id, schema.sessionCaptures.sessionId)
          )
          .where(and(...conditions))
          .groupBy(
            schema.monitoringSessions.id,
            schema.monitoringSessions.name,
            schema.monitoringSessions.startedAt
          )
          .orderBy(desc(schema.monitoringSessions.startedAt))
          .limit(20);

        console.log(
          `[DocGenerationStream] Raw sessions found (with date filter): ${rawSessions.length}`
        );
        rawSessions.forEach((s) => {
          console.log(
            `[DocGenerationStream]   - ${s.name || "Unnamed"}: ${s.captureCount} captures, started ${s.startedAt}`
          );
        });

        // Filter to sessions with captures
        const sessionsWithCaptures = rawSessions.filter((s) => s.captureCount > 0);
        console.log(
          `[DocGenerationStream] Found ${sessionsWithCaptures.length} sessions with captures (fallback)`
        );

        if (sessionsWithCaptures.length === 0) {
          // If no sessions in date range, try without date filter
          if (dateRange) {
            console.log(
              `[DocGenerationStream] No sessions in date range, trying without date filter...`
            );
            const allSessions = await db
              .select({
                id: schema.monitoringSessions.id,
                name: schema.monitoringSessions.name,
                startedAt: schema.monitoringSessions.startedAt,
                captureCount: sql<number>`COALESCE(COUNT(${schema.sessionCaptures.id}), 0)`,
              })
              .from(schema.monitoringSessions)
              .leftJoin(
                schema.sessionCaptures,
                eq(schema.monitoringSessions.id, schema.sessionCaptures.sessionId)
              )
              .where(
                and(
                  eq(schema.monitoringSessions.organizationId, organizationId),
                  eq(schema.monitoringSessions.userId, userId)
                )
              )
              .groupBy(
                schema.monitoringSessions.id,
                schema.monitoringSessions.name,
                schema.monitoringSessions.startedAt
              )
              .orderBy(desc(schema.monitoringSessions.startedAt))
              .limit(20);

            const allWithCaptures = allSessions.filter((s) => s.captureCount > 0);
            console.log(
              `[DocGenerationStream] Sessions with captures (no date filter): ${allWithCaptures.length}`
            );

            if (allWithCaptures.length > 0) {
              // Use these sessions instead
              sessionIds = allWithCaptures.map((s) => s.id);
              sources = allWithCaptures.map((s) => ({
                type: "session",
                sessionId: s.id,
                sessionName: s.name || "Unnamed Session",
                chunkCount: s.captureCount,
              }));
              console.log(
                `[DocGenerationStream] Using ${sessionIds.length} sessions from all time`
              );
            } else {
              throw new Error(
                "No sessions with activity found. Record some work sessions first, then try generating a document."
              );
            }
          } else {
            throw new Error(
              "No sessions with activity found. Record some work sessions first, then try generating a document."
            );
          }
        } else {
          sessionIds = sessionsWithCaptures.map((s) => s.id);
          sources = sessionsWithCaptures.map((s) => ({
            type: "session",
            sessionId: s.id,
            sessionName: s.name || "Unnamed Session",
            chunkCount: s.captureCount,
          }));
        }
      } else {
        // Build sources from chunk data
        sources = Array.from(sessionMap.entries()).map(([sessionId, sessionChunks]) => ({
          type: "session",
          sessionId,
          sessionName: sessionChunks[0]?.sessionName || "Unnamed Session",
          chunkCount: sessionChunks.length,
        }));
      }

      // Phase 3: Auto-discover relevant artifacts + Create RLM environment
      yield {
        type: "progress",
        phase: "analyzing_data",
        message: "Searching for relevant reference documents...",
      } as ProgressEvent;

      // Merge explicitly provided artifact IDs with auto-discovered ones
      const allArtifactIds = artifactIds ? [...artifactIds] : [];
      try {
        const { artifactEmbeddingService } =
          await import("../services/artifact-embedding.service.js");
        const relevantArtifacts = await artifactEmbeddingService.queryRelevant(prompt, {
          organizationId,
          topK: 5,
        });
        const discoveredIds = relevantArtifacts
          .filter((a) => a.score >= 0.4) // Only include meaningfully relevant artifacts
          .map((a) => a.artifactId);
        const existingSet = new Set(allArtifactIds);
        const newIds = discoveredIds.filter((id) => !existingSet.has(id));
        if (newIds.length > 0) {
          allArtifactIds.push(...newIds);
          console.log(
            `[DocGenerationStream] Auto-discovered ${newIds.length} relevant artifact(s)`
          );
        }
      } catch (error) {
        // Non-fatal: artifact search may fail if Pinecone is unavailable
        console.warn("[DocGenerationStream] Artifact auto-discovery failed:", error);
      }

      const environment = createDocumentEnvironment(
        sessionIds,
        organizationId,
        userId, // CRITICAL: Pass userId to prevent data leakage
        prompt,
        dateRange || null,
        allArtifactIds.length > 0 ? allArtifactIds : undefined
      );

      // Phase 4: Run RLM agent with tool-calling loop
      yield {
        type: "progress",
        phase: "drafting",
        message: "Analyzing sessions with AI agent...",
      } as ProgressEvent;

      let generatedContent = "";
      let toolCallCount = 0;

      // Stream RLM agent execution
      for await (const step of documentGenerationAgent.generateDocument(
        docType,
        prompt,
        environment
      )) {
        if (step.type === "tool_call") {
          toolCallCount += step.toolCalls?.length || 0;
          console.log(`[DocGenerationStream] Agent made ${toolCallCount} total tool calls`);
          // Optionally yield progress updates
          yield {
            type: "progress",
            phase: "drafting",
            message: `Analyzing data (${toolCallCount} queries)...`,
          } as ProgressEvent;
        } else if (step.type === "content") {
          generatedContent = step.content || "";
          // Stream the content character by character for smooth UX
          for (let i = 0; i < generatedContent.length; i += 50) {
            const chunk = generatedContent.substring(i, i + 50);
            yield { type: "chunk", content: chunk } as StreamChunk;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      }

      console.log(
        `[DocGenerationStream] RLM generation complete (${toolCallCount} tool calls, ${generatedContent.length} chars)`
      );

      // Phase 5: Polish and finalize
      yield {
        type: "progress",
        phase: "polishing",
        message: "Finalizing document...",
      } as ProgressEvent;

      // Extract title from content
      const title = this.extractTitle(generatedContent, docType, prompt);

      // Update document with final content
      await db
        .update(schema.documents)
        .set({
          title,
          content: generatedContent,
          updatedAt: new Date(),
        })
        .where(eq(schema.documents.id, documentId));

      // Create initial version
      await db.insert(schema.documentVersions).values({
        documentId,
        version: 1,
        content: generatedContent,
        changeType: "created",
        changedBy: userId,
        changeSummary: `Generated ${docType} from prompt: "${prompt.slice(0, 100)}"`,
      });

      // Link contributing sessions (if sources found)
      if (sources.length > 0) {
        const sessionIds = sources
          .filter((s: any) => s.type === "session" && s.sessionId)
          .map((s: any) => s.sessionId);

        const uniqueSessionIds = [...new Set(sessionIds)];

        for (const sessionId of uniqueSessionIds.slice(0, 10)) {
          // Limit to 10 sessions
          await db
            .insert(schema.sessionDocumentContributions)
            .values({
              sessionId,
              documentId,
              contributionType: "source",
              insightsUsed: [],
            })
            .onConflictDoNothing();
        }
      }

      // Yield complete event
      yield {
        type: "complete",
        content: generatedContent,
        documentId,
        sources,
      } as any;
    } catch (error) {
      console.error("[DocGenerationStream] Error:", error);

      // Clean up orphan document record if it was created but generation failed
      if (documentId) {
        try {
          await db.delete(schema.documents).where(eq(schema.documents.id, documentId));
          console.log(`[DocGenerationStream] Cleaned up orphan document ${documentId}`);
        } catch (cleanupError) {
          console.error("[DocGenerationStream] Failed to clean up orphan document:", cleanupError);
        }
      }

      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Document generation failed",
      } as StreamChunk;
    }
  }

  /**
   * Parse date range from natural language prompt
   */
  private parseDateRangeFromPrompt(prompt: string): { start: Date; end: Date } | undefined {
    const now = new Date();
    const lowerPrompt = prompt.toLowerCase();

    // Helper: Get start of week (Monday)
    const getStartOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Helper: Get end of day
    const getEndOfDay = (date: Date): Date => {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    // "this week" or "weekly report"
    if (lowerPrompt.includes("this week") || lowerPrompt.includes("weekly report")) {
      const start = getStartOfWeek(now);
      const end = getEndOfDay(now);
      return { start, end };
    }

    // "last week"
    if (lowerPrompt.includes("last week")) {
      const lastWeekStart = getStartOfWeek(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      return { start: lastWeekStart, end: lastWeekEnd };
    }

    // "today"
    if (lowerPrompt.includes("today")) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = getEndOfDay(now);
      return { start, end };
    }

    // "yesterday"
    if (lowerPrompt.includes("yesterday")) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
      return { start: yesterday, end };
    }

    // "this month"
    if (lowerPrompt.includes("this month")) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = getEndOfDay(now);
      return { start, end };
    }

    // "last month"
    if (lowerPrompt.includes("last month")) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: lastMonth, end: lastMonthEnd };
    }

    // No date range detected
    return undefined;
  }

  /**
   * Extract title from generated content or create from prompt
   */
  private extractTitle(content: string, docType: DocType, prompt: string): string {
    // Try to extract first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Try to extract from prompt
    const cleanedPrompt = prompt
      .replace(/^(create|write|generate|make|build)\s+(a|an|the)?\s*/i, "")
      .trim();

    if (cleanedPrompt.length > 10 && cleanedPrompt.length < 100) {
      // Capitalize first letter
      return cleanedPrompt.charAt(0).toUpperCase() + cleanedPrompt.slice(1);
    }

    // Fallback titles by type
    const fallbacks: Record<DocType, string> = {
      "how-to": "How-To Guide",
      "knowledge-article": "Knowledge Article",
      troubleshooting: "Troubleshooting Guide",
    };

    return fallbacks[docType];
  }
}

// Export singleton
export const docGenerationStreamService = new DocGenerationStreamService();
