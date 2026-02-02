/**
 * Document Generation Environment
 *
 * RLM pattern: Database acts as the external environment.
 * Tools query the DB in bounded slices rather than loading all data into memory.
 * This keeps memory usage constant regardless of session count/length.
 */

import { db } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";

export interface DocumentGenerationEnvironment {
  sessionIds: string[];
  organizationId: string;
  userId: string; // CRITICAL: User ID for data isolation
  dateRange: { start: Date; end: Date } | null;
  query: string;
}

export interface SessionMetadata {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date | null;
  duration: number; // seconds
  timeBreakdown: Record<string, number>; // app -> milliseconds
}

export interface TimelineActivity {
  timestamp: Date;
  actionType: string;
  application: string | null;
  windowTitle: string | null;
  url: string | null;
  description: string;
}

export interface SessionTimeBreakdown {
  sessionId: string;
  sessionName: string;
  applications: Array<{
    name: string;
    milliseconds: number;
    percentage: number;
  }>;
}

/**
 * Create environment from RAG search results
 */
export function createDocumentEnvironment(
  sessionIds: string[],
  organizationId: string,
  userId: string,
  query: string,
  dateRange: { start: Date; end: Date } | null
): DocumentGenerationEnvironment {
  return {
    sessionIds,
    organizationId,
    userId,
    dateRange,
    query,
  };
}

/**
 * Get high-level metadata for all sessions in environment
 */
export async function getSessionsMetadata(
  env: DocumentGenerationEnvironment
): Promise<SessionMetadata[]> {
  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      startedAt: schema.monitoringSessions.startedAt,
      endedAt: schema.monitoringSessions.endedAt,
      totalPausedMs: schema.monitoringSessions.totalPausedMs,
      timeBreakdown: schema.monitoringSessions.timeBreakdown,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        inArray(schema.monitoringSessions.id, env.sessionIds),
        eq(schema.monitoringSessions.userId, env.userId) // CRITICAL: Prevent cross-user access
      )
    );

  return sessions.map((s) => {
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    const duration = Math.round((end - start - (s.totalPausedMs || 0)) / 1000);

    return {
      id: s.id,
      name: s.name || "Unnamed Session",
      startedAt: new Date(s.startedAt),
      endedAt: s.endedAt ? new Date(s.endedAt) : null,
      duration,
      timeBreakdown: (s.timeBreakdown as Record<string, number>) || {},
    };
  });
}

/**
 * Get chronological timeline of activities for a session
 * Reads from session_chunks (classifier chunks) which are already time-ordered
 */
export async function getSessionTimeline(
  _env: DocumentGenerationEnvironment,
  sessionId: string,
  limit?: number
): Promise<TimelineActivity[]> {
  // Get classifier chunks for this session
  const chunks = await db
    .select({
      text: schema.sessionChunks.text,
      metadata: schema.sessionChunks.metadata,
      chunkIndex: schema.sessionChunks.chunkIndex,
    })
    .from(schema.sessionChunks)
    .where(
      and(
        eq(schema.sessionChunks.sessionId, sessionId),
        eq(schema.sessionChunks.chunkType, "classifier")
      )
    )
    .orderBy(schema.sessionChunks.chunkIndex);

  // Parse activities from chunk metadata
  const activities: TimelineActivity[] = [];

  for (const chunk of chunks) {
    const metadata = chunk.metadata as any;

    // Extract timestamp from timeRange
    const timeRange = metadata.timeRange;
    const timestamp = timeRange?.start ? new Date(timeRange.start) : null;

    // Extract event types and entities
    const eventTypes = metadata.eventTypes || [];
    const entities = metadata.entities || {};
    const apps = entities.applications || [];
    const urls = entities.urls || [];

    // Create activity description from chunk text (first 200 chars)
    const description = chunk.text.split("\n").slice(2, 4).join(" ").trim().substring(0, 200);

    if (timestamp) {
      activities.push({
        timestamp,
        actionType: eventTypes[0] || "activity",
        application: apps[0] || null,
        windowTitle: null,
        url: urls[0] || null,
        description,
      });
    }
  }

  return limit ? activities.slice(0, limit) : activities;
}

/**
 * Get application time breakdown across multiple sessions
 */
export async function getTimeBreakdownAcrossSessions(
  env: DocumentGenerationEnvironment
): Promise<SessionTimeBreakdown[]> {
  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      timeBreakdown: schema.monitoringSessions.timeBreakdown,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        inArray(schema.monitoringSessions.id, env.sessionIds),
        eq(schema.monitoringSessions.userId, env.userId) // CRITICAL: Prevent cross-user access
      )
    );

  return sessions.map((s) => {
    const breakdown = (s.timeBreakdown as Record<string, number>) || {};
    const total = Object.values(breakdown).reduce((sum, ms) => sum + ms, 0);

    const applications = Object.entries(breakdown)
      .map(([name, milliseconds]) => ({
        name,
        milliseconds,
        percentage: total > 0 ? Math.round((milliseconds / total) * 100) : 0,
      }))
      .sort((a, b) => b.milliseconds - a.milliseconds);

    return {
      sessionId: s.id,
      sessionName: s.name || "Unnamed Session",
      applications,
    };
  });
}

/**
 * Get session summary (storyteller narrative)
 */
export async function getSessionSummary(sessionId: string): Promise<string | null> {
  const chunks = await db
    .select({
      text: schema.sessionChunks.text,
    })
    .from(schema.sessionChunks)
    .where(
      and(
        eq(schema.sessionChunks.sessionId, sessionId),
        eq(schema.sessionChunks.chunkType, "storyteller_summary")
      )
    )
    .orderBy(schema.sessionChunks.chunkIndex);

  if (chunks.length === 0) return null;

  // Combine all summary chunks
  return chunks.map((c) => c.text).join("\n\n");
}

/**
 * Get top applications across all sessions
 */
export async function getTopApplications(
  env: DocumentGenerationEnvironment,
  limit = 10
): Promise<Array<{ application: string; totalMs: number; percentage: number }>> {
  const sessions = await db
    .select({
      timeBreakdown: schema.monitoringSessions.timeBreakdown,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        inArray(schema.monitoringSessions.id, env.sessionIds),
        eq(schema.monitoringSessions.userId, env.userId) // CRITICAL: Prevent cross-user access
      )
    );

  // Aggregate time across all sessions
  const appTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const session of sessions) {
    const breakdown = (session.timeBreakdown as Record<string, number>) || {};
    for (const [app, ms] of Object.entries(breakdown)) {
      appTotals.set(app, (appTotals.get(app) || 0) + ms);
      grandTotal += ms;
    }
  }

  // Sort and return top N
  return Array.from(appTotals.entries())
    .map(([application, totalMs]) => ({
      application,
      totalMs,
      percentage: grandTotal > 0 ? Math.round((totalMs / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, limit);
}

/**
 * Filter sessions by priority (based on accomplishments/outcomes in summaries)
 */
export async function filterSessionsByPriority(
  env: DocumentGenerationEnvironment,
  priority: "high" | "medium" | "low"
): Promise<string[]> {
  // Get summaries for all sessions (with userId check via join for defense in depth)
  const summaries = await db
    .select({
      sessionId: schema.sessionSummaries.sessionId,
      narrativeSummary: schema.sessionSummaries.narrativeSummary,
      activities: schema.sessionSummaries.activities,
    })
    .from(schema.sessionSummaries)
    .innerJoin(
      schema.monitoringSessions,
      eq(schema.sessionSummaries.sessionId, schema.monitoringSessions.id)
    )
    .where(
      and(
        inArray(schema.sessionSummaries.sessionId, env.sessionIds),
        eq(schema.monitoringSessions.userId, env.userId) // CRITICAL: Prevent cross-user access
      )
    );

  // Simple heuristic: high priority = has accomplishments, medium = has activities, low = short
  const prioritized: string[] = [];

  for (const summary of summaries) {
    const narrative = summary.narrativeSummary as any;
    const accomplishments = narrative?.accomplishments || [];
    const activities = (summary.activities as any[]) || [];

    let sessionPriority: "high" | "medium" | "low";
    if (accomplishments.length > 0) {
      sessionPriority = "high";
    } else if (activities.length > 3) {
      sessionPriority = "medium";
    } else {
      sessionPriority = "low";
    }

    if (sessionPriority === priority) {
      prioritized.push(summary.sessionId);
    }
  }

  return prioritized;
}
