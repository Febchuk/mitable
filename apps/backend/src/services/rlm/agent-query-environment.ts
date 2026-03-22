/**
 * Agent Query Environment
 *
 * User-facing data access layer for the Agent's conversational query layer (Layer 1).
 * Provides on-demand access to a user's own activity, sessions, meetings, and documents.
 * All queries are scoped to the authenticated user. Date ranges capped at 31 days per call.
 */

import { db } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const MAX_RANGE_DAYS = 31;

export class AgentQueryEnvironment {
  constructor(
    private userId: string,
    private organizationId: string
  ) {}

  private clampRange(startDate: string, endDate: string): { start: string; end: string } {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > MAX_RANGE_DAYS) {
      const clamped = new Date(e);
      clamped.setDate(clamped.getDate() - MAX_RANGE_DAYS);
      return { start: clamped.toISOString().split("T")[0]!, end: endDate };
    }
    return { start: startDate, end: endDate };
  }

  private defaultRange(startDate?: string, endDate?: string) {
    const end = endDate || new Date().toISOString().split("T")[0]!;
    const start =
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    return this.clampRange(start, end);
  }

  async getMyActivity(startDate?: string, endDate?: string) {
    const { start, end } = this.defaultRange(startDate, endDate);
    const startDt = new Date(start + "T00:00:00Z");
    const endDt = new Date(end + "T23:59:59Z");

    const [blocks, dailyActivities, sessions, documents] = await Promise.all([
      db
        .select({
          id: schema.activityBlocks.id,
          blockType: schema.activityBlocks.blockType,
          name: schema.activityBlocks.name,
          description: schema.activityBlocks.description,
          startTime: schema.activityBlocks.startTime,
          endTime: schema.activityBlocks.endTime,
          durationMinutes: schema.activityBlocks.durationMinutes,
          category: schema.activityBlocks.category,
          participants: schema.activityBlocks.participants,
          apps: schema.activityBlocks.apps,
          topicName: schema.activityBlocks.topicName,
          subscriberName: schema.activityBlocks.subscriberName,
        })
        .from(schema.activityBlocks)
        .where(
          and(
            eq(schema.activityBlocks.userId, this.userId),
            gte(schema.activityBlocks.startTime, startDt),
            lte(schema.activityBlocks.startTime, endDt)
          )
        )
        .orderBy(desc(schema.activityBlocks.startTime))
        .limit(50),

      db
        .select({
          id: schema.userDailyActivities.id,
          activityDate: schema.userDailyActivities.activityDate,
          totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
          totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
          totalSessions: schema.userDailyActivities.totalSessions,
          daySummary: schema.userDailyActivities.daySummary,
          keyAccomplishments: schema.userDailyActivities.keyAccomplishments,
          categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.userId, this.userId),
            gte(schema.userDailyActivities.activityDate, start),
            lte(schema.userDailyActivities.activityDate, end),
            eq(schema.userDailyActivities.periodType, "daily")
          )
        )
        .orderBy(desc(schema.userDailyActivities.activityDate))
        .limit(31),

      db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          sessionType: schema.monitoringSessions.sessionType,
          status: schema.monitoringSessions.status,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          finalSummary: schema.monitoringSessions.finalSummary,
          taskBreakdown: schema.monitoringSessions.taskBreakdown,
          accomplishments: schema.monitoringSessions.accomplishments,
          blockers: schema.monitoringSessions.blockers,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, this.userId),
            gte(schema.monitoringSessions.startedAt, startDt),
            lte(schema.monitoringSessions.startedAt, endDt)
          )
        )
        .orderBy(desc(schema.monitoringSessions.startedAt))
        .limit(20),

      db
        .select({
          id: schema.documents.id,
          title: schema.documents.title,
          docType: schema.documents.docType,
          status: schema.documents.status,
          description: schema.documents.description,
          createdAt: schema.documents.createdAt,
        })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.createdBy, this.userId),
            gte(schema.documents.createdAt, startDt),
            lte(schema.documents.createdAt, endDt)
          )
        )
        .orderBy(desc(schema.documents.createdAt))
        .limit(20),
    ]);

    return {
      dateRange: { start, end },
      activityBlocks: blocks,
      dailySummaries: dailyActivities,
      sessions,
      documents,
    };
  }

  async getActivityDetail(id: string, type: "block" | "session" | "document") {
    if (type === "block") {
      const [block] = await db
        .select({
          id: schema.activityBlocks.id,
          blockType: schema.activityBlocks.blockType,
          name: schema.activityBlocks.name,
          description: schema.activityBlocks.description,
          rawTranscript: schema.activityBlocks.rawTranscript,
          startTime: schema.activityBlocks.startTime,
          endTime: schema.activityBlocks.endTime,
          durationMinutes: schema.activityBlocks.durationMinutes,
          category: schema.activityBlocks.category,
          participants: schema.activityBlocks.participants,
          apps: schema.activityBlocks.apps,
          topicName: schema.activityBlocks.topicName,
          subscriberName: schema.activityBlocks.subscriberName,
        })
        .from(schema.activityBlocks)
        .where(and(eq(schema.activityBlocks.id, id), eq(schema.activityBlocks.userId, this.userId)))
        .limit(1);
      return block ? { type: "block", data: block } : { error: "Activity block not found" };
    }

    if (type === "session") {
      const [session] = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          sessionType: schema.monitoringSessions.sessionType,
          status: schema.monitoringSessions.status,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          finalSummary: schema.monitoringSessions.finalSummary,
          keyActivities: schema.monitoringSessions.keyActivities,
          taskBreakdown: schema.monitoringSessions.taskBreakdown,
          timeBreakdown: schema.monitoringSessions.timeBreakdown,
          accomplishments: schema.monitoringSessions.accomplishments,
          blockers: schema.monitoringSessions.blockers,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.id, id),
            eq(schema.monitoringSessions.userId, this.userId)
          )
        )
        .limit(1);
      return session ? { type: "session", data: session } : { error: "Session not found" };
    }

    if (type === "document") {
      const [doc] = await db
        .select({
          id: schema.documents.id,
          title: schema.documents.title,
          docType: schema.documents.docType,
          status: schema.documents.status,
          description: schema.documents.description,
          content: schema.documents.content,
          tags: schema.documents.tags,
          createdAt: schema.documents.createdAt,
          updatedAt: schema.documents.updatedAt,
        })
        .from(schema.documents)
        .where(and(eq(schema.documents.id, id), eq(schema.documents.createdBy, this.userId)))
        .limit(1);
      return doc ? { type: "document", data: doc } : { error: "Document not found" };
    }

    return { error: "Invalid type. Must be: block, session, or document" };
  }
}
