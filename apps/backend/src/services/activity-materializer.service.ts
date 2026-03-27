/**
 * Activity Materializer Service
 *
 * Runs on session end (alongside storyteller/ingestion).
 * Reads a session's keyActivities (from Claude classification) and converts
 * them into activity blocks + daily aggregate stats for the admin dashboard.
 *
 * Flow:
 *   1. Fetch session metadata + keyActivities (from classifySession)
 *   2. Convert keyActivities into activity_blocks rows
 *   3. Upsert user_daily_activities row for that user+date
 *   4. Recalculate daily aggregate stats (categoryBreakdown, appBreakdown, etc.)
 *
 * If keyActivities is empty, falls back to capture-based grouping.
 *
 * Idempotency: Checks processedSessionIds to skip already-materialized sessions.
 *
 * @module activity-materializer
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { normalizeName } from "./normalize-name.js";
import { syncSubscriberToGraph, syncTopicToGraph } from "./graph/graph-incremental-sync.service.js";
import { getKnownCustomers } from "./known-customers.service.js";

const logger = createLogger({ context: "activity-materializer" });

/**
 * Normalize a capture-level app name into a stable display name.
 *
 * desktopCapturer sometimes leaks window-title fragments as app names
 * (e.g. "Slack Huddle", "Teams Meeting") instead of the process name ("Slack").
 * This maps known variants back to their canonical name and strips
 * OS extensions (.exe, .app).
 */
const APP_NAME_ALIASES: Record<string, string> = {
  "slack huddle": "Slack",
  "slack call": "Slack",
  "teams meeting": "Microsoft Teams",
  "teams call": "Microsoft Teams",
};

function normalizeAppDisplayName(raw: string): string {
  if (!raw) return raw;

  // Strip OS extensions
  let name = raw
    .replace(/\.exe$/i, "")
    .replace(/\.app$/i, "")
    .replace(/\.AppImage$/i, "")
    .trim();

  // Check alias table first
  const alias = APP_NAME_ALIASES[name.toLowerCase()];
  if (alias) return alias;

  // If the name looks like a window-title fragment ("App Name - details"),
  // keep only the first segment which is usually the app name.
  if (name.includes(" - ")) {
    name = name.split(" - ")[0].trim();
  }

  return name;
}

// ============================================================================
// Types
// ============================================================================

interface MaterializedBlock {
  name: string;
  blockType: "work" | "meeting";
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  description: string;
  apps: string[];
  category: string;
  topicName: string | null;
  subscriberName: string | null;
}

// ============================================================================
// Core: materializeSession
// ============================================================================

/**
 * Materialize a single session into activity blocks and daily stats.
 * Prefers keyActivities (from Claude classification) over raw captures.
 */
export async function materializeSession(sessionId: string): Promise<void> {
  const startMs = Date.now();

  try {
    // 1. Fetch session metadata + keyActivities
    const [session] = await db
      .select({
        id: schema.monitoringSessions.id,
        userId: schema.monitoringSessions.userId,
        organizationId: schema.monitoringSessions.organizationId,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        name: schema.monitoringSessions.name,
        keyActivities: schema.monitoringSessions.keyActivities,
      })
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      logger.warn({ sessionId }, "Session not found for materialization");
      return;
    }

    const activityDate = new Date(session.startedAt).toISOString().split("T")[0]!;

    // 2. Idempotency check — has this session already been materialized?
    const [existingDay] = await db
      .select({
        id: schema.userDailyActivities.id,
        processedSessionIds: schema.userDailyActivities.processedSessionIds,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, session.userId),
          eq(schema.userDailyActivities.activityDate, activityDate),
          eq(schema.userDailyActivities.periodType, "daily")
        )
      )
      .limit(1);

    const processedIds = (existingDay?.processedSessionIds as string[]) || [];
    if (processedIds.includes(sessionId)) {
      logger.info({ sessionId, activityDate }, "Session already materialized, skipping");
      return;
    }

    // 3. Build blocks from keyActivities (Claude classification)
    const sessionStart = new Date(session.startedAt);
    const sessionEnd = session.endedAt ? new Date(session.endedAt) : new Date();
    const keyActivities = (session.keyActivities as any[]) || [];

    const blocks: MaterializedBlock[] = [];

    if (keyActivities.length > 0 && typeof keyActivities[0]?.category === "string") {
      // Use classified activities — distribute time proportionally across the session
      let offsetMs = 0;
      const totalClassifiedMinutes = keyActivities.reduce(
        (s: number, a: any) => s + (a.minutes || 0),
        0
      );
      const sessionDurationMs = sessionEnd.getTime() - sessionStart.getTime();

      for (const act of keyActivities) {
        const minutes = Math.max(1, act.minutes || 1);
        const fractionMs =
          totalClassifiedMinutes > 0
            ? (minutes / totalClassifiedMinutes) * sessionDurationMs
            : sessionDurationMs / keyActivities.length;

        const blockStart = new Date(sessionStart.getTime() + offsetMs);
        const blockEnd = new Date(sessionStart.getTime() + offsetMs + fractionMs);
        const category = (act.category || "Other").toLowerCase();

        blocks.push({
          name: act.activity || "Activity",
          blockType: category === "meeting" ? "meeting" : "work",
          startTime: blockStart,
          endTime: blockEnd,
          durationMinutes: minutes,
          description: act.description || act.activity || "",
          apps: [],
          category,
          topicName: act.topic || null,
          subscriberName: act.subscriber || null,
        });

        offsetMs += fractionMs;
      }
    } else {
      // Fallback: no classification — create one generic block
      const durationMin = Math.max(
        1,
        Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000)
      );
      blocks.push({
        name: session.name || "Work session",
        blockType: "work",
        startTime: sessionStart,
        endTime: sessionEnd,
        durationMinutes: durationMin,
        description: "Unclassified session.",
        apps: [],
        category: "other",
        topicName: null,
        subscriberName: null,
      });
    }

    // Fetch known customers for subscriber-from-topic fallback
    const knownCustomers = await getKnownCustomers(session.organizationId);

    // 3b. Infer subscriberName from topic/block name when missing
    if (knownCustomers.length > 0) {
      for (const block of blocks) {
        if (!block.subscriberName) {
          const textToSearch = `${block.topicName || ""} ${block.name}`.toLowerCase();
          const matched = knownCustomers.find((c) => textToSearch.includes(c.toLowerCase()));
          if (matched) block.subscriberName = matched;
        }
      }
    }

    // 4. Enrich blocks with app names from captures (for appBreakdown).
    // Normalize names so "Slack Huddle" and "Slack - #general" both roll up to "Slack".
    const captures = await db
      .select({ appName: schema.sessionCaptures.appName })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId));

    const rawApps = captures.map((c) => c.appName).filter(Boolean) as string[];
    const uniqueApps = [...new Set(rawApps.map(normalizeAppDisplayName))];
    if (uniqueApps.length > 0) {
      for (const block of blocks) {
        block.apps = uniqueApps;
      }
    }

    // 5-8. Upsert daily activity, insert blocks, recalculate — all in one transaction
    const dailyActivityId = existingDay?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // 5. Upsert daily activity row
      if (!existingDay) {
        await tx.insert(schema.userDailyActivities).values({
          id: dailyActivityId,
          userId: session.userId,
          organizationId: session.organizationId,
          activityDate,
          periodType: "daily",
          processedSessionIds: [sessionId],
          status: "completed",
          lastProcessedAt: new Date(),
        });
      } else {
        await tx
          .update(schema.userDailyActivities)
          .set({
            processedSessionIds: [...processedIds, sessionId],
            lastProcessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.userDailyActivities.id, dailyActivityId));
      }

      // 6. Get current max sequence number for this day
      const [{ maxSeq }] = await tx
        .select({ maxSeq: sql<number>`coalesce(max(${schema.activityBlocks.sequenceNumber}), -1)` })
        .from(schema.activityBlocks)
        .where(eq(schema.activityBlocks.dailyActivityId, dailyActivityId));

      const nextSeq = (maxSeq ?? -1) + 1;

      // 7. Batch insert activity blocks for this session
      if (blocks.length > 0) {
        await tx.insert(schema.activityBlocks).values(
          blocks.map((block, i) => ({
            dailyActivityId,
            userId: session.userId,
            blockType: block.blockType,
            name: block.name,
            startTime: block.startTime,
            endTime: block.endTime,
            durationMinutes: block.durationMinutes,
            description: block.description,
            apps: block.apps,
            category: block.category,
            topicName: block.topicName,
            subscriberName: block.subscriberName,
            sessionId,
            sourceSessionIds: [sessionId],
            sequenceNumber: nextSeq + i,
          }))
        );
      }

      // 8. Recalculate daily aggregate stats from ALL blocks for this day
      await recalculateDailyStats(dailyActivityId, tx, knownCustomers);
    });

    // Fire-and-forget: sync topics/subscribers to Neo4j graph
    const personKey = Buffer.from(`${session.organizationId}:${session.userId}`).toString("base64");
    for (const block of blocks) {
      if (block.subscriberName) {
        syncSubscriberToGraph(
          session.organizationId,
          block.subscriberName,
          personKey,
          block.durationMinutes,
          1
        ).catch((err) =>
          logger.warn({ err: String(err) }, "Graph subscriber sync failed (non-fatal)")
        );
      }
      if (block.topicName) {
        syncTopicToGraph(
          session.organizationId,
          block.topicName,
          personKey,
          block.category,
          block.durationMinutes,
          1
        ).catch((err) => logger.warn({ err: String(err) }, "Graph topic sync failed (non-fatal)"));
      }
    }

    const elapsed = Date.now() - startMs;
    logger.info(
      { sessionId, activityDate, blockCount: blocks.length, elapsedMs: elapsed },
      "Session materialized"
    );
  } catch (error) {
    logger.error(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      "Activity materialization failed"
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recalculate aggregate stats for a user_daily_activities row
 * from all its activity_blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalculateDailyStats(
  dailyActivityId: string,
  txOrDb: any = db,
  knownCustomers: string[] = []
): Promise<void> {
  // Fetch all blocks for this day
  const blocks = await txOrDb
    .select({
      blockType: schema.activityBlocks.blockType,
      durationMinutes: schema.activityBlocks.durationMinutes,
      apps: schema.activityBlocks.apps,
      category: schema.activityBlocks.category,
      sessionId: schema.activityBlocks.sessionId,
      topicName: schema.activityBlocks.topicName,
      subscriberName: schema.activityBlocks.subscriberName,
    })
    .from(schema.activityBlocks)
    .where(eq(schema.activityBlocks.dailyActivityId, dailyActivityId));

  let totalWorkMinutes = 0;
  let totalMeetingMinutes = 0;
  const appMinutes: Record<string, number> = {};
  const categoryMinutes: Record<string, number> = {};
  const topicMinutes: Record<string, number> = {};
  const topicDisplayNames: Record<string, string> = {};
  const subscriberMinutes: Record<string, number> = {};
  const subscriberDisplayNames: Record<string, string> = {};
  const sessionIds = new Set<string>();

  for (const block of blocks) {
    if (
      block.blockType === "meeting" ||
      block.blockType === "granola" ||
      block.blockType === "fireflies"
    ) {
      totalMeetingMinutes += block.durationMinutes;
    } else {
      totalWorkMinutes += block.durationMinutes;
    }

    if (block.sessionId) sessionIds.add(block.sessionId);

    // App breakdown (normalize so "Slack Huddle" → "Slack")
    const blockApps = ((block.apps as string[]) || []).map(normalizeAppDisplayName);
    const dedupedApps = [...new Set(blockApps)];
    const perAppMinutes = dedupedApps.length > 0 ? block.durationMinutes / dedupedApps.length : 0;
    for (const app of dedupedApps) {
      appMinutes[app] = (appMinutes[app] || 0) + perAppMinutes;
    }

    // Category breakdown — use the classified category from the block
    const cat = (block.category as string) || "other";
    categoryMinutes[cat] = (categoryMinutes[cat] || 0) + block.durationMinutes;

    // Topic breakdown (normalize key, keep longest display name)
    if (block.topicName) {
      const tKey = normalizeName(block.topicName);
      topicMinutes[tKey] = (topicMinutes[tKey] || 0) + block.durationMinutes;
      if (!topicDisplayNames[tKey] || block.topicName.length > topicDisplayNames[tKey].length) {
        topicDisplayNames[tKey] = block.topicName;
      }
    }

    // Subscriber breakdown (normalize key, keep longest display name)
    // Fallback: infer subscriber from topic name if it mentions a known customer
    let effectiveSubscriber = block.subscriberName as string | null;
    if (!effectiveSubscriber && block.topicName && knownCustomers.length > 0) {
      const topicLower = (block.topicName as string).toLowerCase();
      const matched = knownCustomers.find((c) => topicLower.includes(c.toLowerCase()));
      if (matched) effectiveSubscriber = matched;
    }

    if (effectiveSubscriber) {
      const sKey = normalizeName(effectiveSubscriber);
      subscriberMinutes[sKey] = (subscriberMinutes[sKey] || 0) + block.durationMinutes;
      if (
        !subscriberDisplayNames[sKey] ||
        effectiveSubscriber.length > subscriberDisplayNames[sKey].length
      ) {
        subscriberDisplayNames[sKey] = effectiveSubscriber;
      }
    }
  }

  const totalActiveMinutes = totalWorkMinutes + totalMeetingMinutes;
  const workPercentage = totalActiveMinutes > 0 ? (totalWorkMinutes / totalActiveMinutes) * 100 : 0;
  const meetingPercentage =
    totalActiveMinutes > 0 ? (totalMeetingMinutes / totalActiveMinutes) * 100 : 0;

  // Compute total session minutes from actual monitoring session durations
  let totalSessionMinutes = 0;
  const sessionIdArray = [...sessionIds];
  if (sessionIdArray.length > 0) {
    const sessions = await txOrDb
      .select({
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
      })
      .from(schema.monitoringSessions)
      .where(inArray(schema.monitoringSessions.id, sessionIdArray));

    for (const s of sessions) {
      if (s.startedAt && s.endedAt) {
        totalSessionMinutes += Math.max(
          0,
          Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
        );
      }
    }
  }

  // Build JSONB arrays
  const appBreakdown = Object.entries(appMinutes)
    .map(([app, minutes]) => ({ app, minutes: Math.round(minutes) }))
    .sort((a, b) => b.minutes - a.minutes);

  const categoryBreakdown = Object.entries(categoryMinutes)
    .map(([category, minutes]) => ({
      category,
      minutes: Math.round(minutes),
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const topicBreakdown = Object.entries(topicMinutes)
    .map(([key, minutes]) => ({
      topicName: topicDisplayNames[key] || key,
      minutes: Math.round(minutes),
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const subscriberBreakdown = Object.entries(subscriberMinutes)
    .map(([key, minutes]) => ({
      subscriberName: subscriberDisplayNames[key] || key,
      minutes: Math.round(minutes),
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  await txOrDb
    .update(schema.userDailyActivities)
    .set({
      totalWorkMinutes: Math.round(totalWorkMinutes),
      totalMeetingMinutes: Math.round(totalMeetingMinutes),
      totalActiveMinutes: Math.round(totalActiveMinutes),
      totalSessionMinutes,
      totalSessions: sessionIds.size,
      totalCaptures: blocks.length,
      workPercentage: Math.round(workPercentage * 10) / 10,
      meetingPercentage: Math.round(meetingPercentage * 10) / 10,
      appBreakdown,
      categoryBreakdown,
      topicBreakdown,
      subscriberBreakdown,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(schema.userDailyActivities.id, dailyActivityId));
}
