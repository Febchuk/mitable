/**
 * SessionIndexingService - Index monitoring sessions into search_content
 *
 * Responsibilities:
 * - Index high-importance activities from classifier RLM outputs
 * - Index session summaries from storyteller RLM outputs
 * - Generate embeddings with OpenAI
 * - Store in PostgreSQL (search_content with pgvector)
 * - Build lightweight doc-ready text for retrieval
 * - Store full RLM environments in JSONB for deep inspection
 *
 * Pattern: Thin retrieval by default, expand on demand via tools
 */

import { embeddingService } from "../domains/shared-infra/services/embedding.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, gte } from "drizzle-orm";
import type { NewSearchContent } from "../domains/integrations/schema/search-content.schema.js";
import type { MonitoringSession, SessionCapture } from "../db/schema/monitoring.schema.js";

const INDEXING_CONFIG = {
  MIN_IMPORTANCE_SCORE: 0.5, // Only index activities with importance >= 0.5
  BATCH_SIZE: 50,
} as const;

export interface SessionIndexingResult {
  success: boolean;
  activitiesIndexed: number;
  summariesIndexed: number;
  errors: string[];
  duration: number;
}

class SessionIndexingService {
  /**
   * Build lightweight doc-ready text for a classifier activity
   */
  private buildActivityDocText(
    capture: SessionCapture,
    session: MonitoringSession,
    classifierData: any
  ): string {
    const time = new Date(capture.capturedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const entities = [
      ...(classifierData.entities?.people || []),
      ...(classifierData.entities?.systems || []),
    ];

    const entitiesText = entities.length > 0 ? `\nInvolved: ${entities.join(", ")}` : "";

    const eventsText =
      classifierData.events?.length > 0
        ? `\nEvents: ${classifierData.events.map((e: any) => `${e.verb} ${e.object}`).join("; ")}`
        : "";

    return `Activity: ${capture.activityDescription || classifierData.activity}
Action: ${classifierData.action_type || "UNKNOWN"}
Time: ${time}
App: ${capture.appName || "Unknown"} - ${capture.windowTitle || ""}
Session: ${session.name || "Work Session"}
${session.sessionGoal ? `Goal: ${session.sessionGoal}` : ""}${entitiesText}${eventsText}
Confidence: ${Math.round((classifierData.confidence || 0) * 100)}%`.trim();
  }

  /**
   * Build lightweight doc-ready text for a session summary
   */
  private buildSessionDocText(session: MonitoringSession, summaryData: any): string {
    const date = new Date(session.startedAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const startTime = new Date(session.startedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const endTime = session.endedAt
      ? new Date(session.endedAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "ongoing";

    const durationMinutes = session.endedAt
      ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000)
      : 0;

    const keyActivities =
      summaryData.activities
        ?.slice(0, 5)
        .map((a: any) => `• ${a.activity || a}`)
        .join("\n") || "";

    const topApps = session.timeBreakdown
      ? Object.entries(session.timeBreakdown as any)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 3)
          .map(([app, ms]) => `${app} (${Math.round((ms as number) / 60000)} min)`)
          .join(", ")
      : "";

    return `Session: ${session.name || "Work Session"}
Date: ${date} (${startTime} - ${endTime})
Duration: ${durationMinutes} minutes
${session.sessionGoal ? `Goal: ${session.sessionGoal}` : ""}

Summary:
${summaryData.narrativeSummary || "No summary available"}

${keyActivities ? `Key Activities:\n${keyActivities}` : ""}

${topApps ? `Apps Used: ${topApps}` : ""}`.trim();
  }

  /**
   * Extract doc facts from classifier data
   */
  private extractDocFacts(capture: SessionCapture, classifierData: any): any | null {
    // Only create facts for high-importance activities
    if (!capture.importanceScore || capture.importanceScore < 0.7) {
      return null;
    }

    // Build claim from activity description
    const claim = capture.activityDescription || classifierData.activity;

    // Build evidence array
    const evidence = [];

    if (capture.windowTitle) {
      evidence.push({
        type: "file",
        value: capture.windowTitle,
        timeRange: new Date(capture.capturedAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }

    if (classifierData.events?.length > 0) {
      classifierData.events.forEach((event: any) => {
        evidence.push({
          type: "event",
          value: `${event.verb} ${event.object}`,
        });
      });
    }

    return {
      claim,
      evidence,
      outcome: null, // Could be filled by connecting to subsequent activities
      confidence: classifierData.confidence || 0,
    };
  }

  /**
   * Index a single activity into search_content
   */
  private async indexActivity(
    capture: SessionCapture,
    session: MonitoringSession,
    organizationId: string
  ): Promise<void> {
    const classifierData = capture.classifierData as any;

    if (!classifierData) {
      return; // Skip if no classifier data
    }

    // Build doc-ready text
    const text = this.buildActivityDocText(capture, session, classifierData);

    // Generate embedding
    const embedding = await embeddingService.embedText(text);

    // Extract doc facts
    const docFacts = this.extractDocFacts(capture, classifierData);

    // Insert into search_content
    const searchContentRow: NewSearchContent = {
      id: `session-${session.id}-activity-${capture.sequenceNumber}`,
      organizationId,
      source: "session",
      sourceType: "activity",
      text,
      textVector: "", // Auto-populated by trigger
      embedding: embedding as any,

      // Session metadata
      sessionId: session.id,
      sessionName: session.name || null,
      sessionGoal: session.sessionGoal || null,
      actionType: classifierData.action_type || null,
      appName: capture.appName || null,
      windowTitle: capture.windowTitle || null,
      importanceScore: Math.round((capture.importanceScore ?? 0) * 100),
      confidence: Math.round((classifierData.confidence || 0) * 100),
      startTime: capture.capturedAt,
      endTime: capture.capturedAt, // Single activity
      durationMinutes: null,
      activityCount: 1,

      // Doc facts
      docFacts: docFacts ? (docFacts as any) : null,

      // RLM environment (for deep inspection via tools)
      classifierEnvironmentJsonb: {
        context: {
          deltaDescription: capture.deltaChangeDescription,
          windowInfo: {
            appName: capture.appName,
            windowTitle: capture.windowTitle,
          },
          timeElapsed: null,
        },
        classification: classifierData,
      } as any,
      storytellerEnvironmentJsonb: null,
      rawCaptureIds: [capture.id],

      // Temporal
      timestamp: capture.capturedAt.getTime(),
      date: capture.capturedAt.toISOString().split("T")[0],
    };

    await db.insert(schema.searchContent).values(searchContentRow).onConflictDoNothing();
  }

  /**
   * Index session summary into search_content
   */
  private async indexSessionSummary(
    session: MonitoringSession,
    organizationId: string
  ): Promise<void> {
    // Get latest session summary
    const [summary] = await db
      .select()
      .from(schema.sessionSummaries)
      .where(eq(schema.sessionSummaries.sessionId, session.id))
      .orderBy(schema.sessionSummaries.version)
      .limit(1);

    if (!summary) {
      return; // No summary yet
    }

    // Get all captures for this session to include in storyteller environment
    const captures = await db
      .select()
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, session.id))
      .orderBy(schema.sessionCaptures.sequenceNumber);

    // Build doc-ready text
    const text = this.buildSessionDocText(session, summary);

    // Generate embedding
    const embedding = await embeddingService.embedText(text);

    // Build storyteller environment (lightweight timeline)
    const timeline = captures
      .filter((c) => c.activityDescription)
      .map((c) => ({
        activityDescription: c.activityDescription!,
        capturedAt: c.capturedAt,
        classifierData: c.classifierData,
      }));

    const durationMinutes = session.endedAt
      ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000)
      : 0;

    // Insert into search_content
    const searchContentRow: NewSearchContent = {
      id: `session-${session.id}-summary`,
      organizationId,
      source: "session",
      sourceType: "summary",
      text,
      textVector: "", // Auto-populated by trigger
      embedding: embedding as any,

      // Session metadata
      sessionId: session.id,
      sessionName: session.name || null,
      sessionGoal: session.sessionGoal || null,
      actionType: null,
      appName: null,
      windowTitle: null,
      importanceScore: null,
      confidence: null,
      startTime: session.startedAt,
      endTime: session.endedAt || null,
      durationMinutes,
      activityCount: captures.length,

      // Doc facts (none for summaries)
      docFacts: null,

      // RLM environment (for deep inspection via tools)
      classifierEnvironmentJsonb: null,
      storytellerEnvironmentJsonb: {
        timeline,
        metadata: {
          sessionId: session.id,
          totalActivities: captures.length,
          durationMinutes,
          startTime: session.startedAt.toISOString(),
          endTime: session.endedAt?.toISOString() || null,
        },
        summary: {
          narrativeSummary: summary.narrativeSummary,
          activities: summary.activities,
          timeBreakdown: summary.timeBreakdown,
        },
      } as any,
      rawCaptureIds: captures.map((c) => c.id),

      // Temporal
      timestamp: session.startedAt.getTime(),
      date: session.startedAt.toISOString().split("T")[0],
    };

    await db.insert(schema.searchContent).values(searchContentRow).onConflictDoNothing();
  }

  /**
   * Index a single session (activities + summary)
   */
  async indexSession(sessionId: string): Promise<SessionIndexingResult> {
    const startTime = Date.now();
    const result: SessionIndexingResult = {
      success: false,
      activitiesIndexed: 0,
      summariesIndexed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Get session
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Get high-importance captures with classifier data
      const captures = await db
        .select()
        .from(schema.sessionCaptures)
        .where(
          and(
            eq(schema.sessionCaptures.sessionId, sessionId),
            gte(schema.sessionCaptures.importanceScore, INDEXING_CONFIG.MIN_IMPORTANCE_SCORE)
          )
        )
        .orderBy(schema.sessionCaptures.sequenceNumber);

      // Index activities
      for (const capture of captures) {
        try {
          await this.indexActivity(capture, session, session.organizationId);
          result.activitiesIndexed++;
        } catch (error) {
          result.errors.push(
            `Failed to index activity ${capture.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Index session summary
      try {
        await this.indexSessionSummary(session, session.organizationId);
        result.summariesIndexed++;
      } catch (error) {
        result.errors.push(
          `Failed to index summary: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Index all completed sessions for an organization
   */
  async indexAllSessions(organizationId: string): Promise<SessionIndexingResult> {
    const startTime = Date.now();
    const result: SessionIndexingResult = {
      success: false,
      activitiesIndexed: 0,
      summariesIndexed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Get all ended sessions that haven't been indexed yet
      const sessions = await db
        .select()
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, organizationId),
            eq(schema.monitoringSessions.status, "ended")
          )
        );

      console.log(`[SessionIndexing] Found ${sessions.length} sessions to index`);

      for (const session of sessions) {
        const sessionResult = await this.indexSession(session.id);
        result.activitiesIndexed += sessionResult.activitiesIndexed;
        result.summariesIndexed += sessionResult.summariesIndexed;
        result.errors.push(...sessionResult.errors);
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      console.log(
        `[SessionIndexing] Indexed ${result.activitiesIndexed} activities and ${result.summariesIndexed} summaries in ${result.duration}ms`
      );

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Re-index a session (useful after editing or re-generating summaries)
   */
  async reindexSession(sessionId: string): Promise<SessionIndexingResult> {
    // Delete existing entries
    await db.delete(schema.searchContent).where(eq(schema.searchContent.sessionId, sessionId));

    // Re-index
    return this.indexSession(sessionId);
  }
}

export const sessionIndexingService = new SessionIndexingService();
