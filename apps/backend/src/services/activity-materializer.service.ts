/**
 * Activity Materializer Service
 *
 * Runs on session end (alongside storyteller/ingestion).
 * Reads a session's captures, groups them into activity blocks,
 * and writes pre-computed data to the daily_activities tables
 * so the admin dashboard can do pure reads.
 *
 * Flow:
 *   1. Fetch all analyzed captures for the session
 *   2. Group consecutive captures into activity blocks (by app + time proximity)
 *   3. Upsert user_daily_activities row for that user+date
 *   4. Insert activity_blocks rows
 *   5. Recalculate daily aggregate stats from ALL blocks for that day
 *
 * Idempotency: Checks processedSessionIds to skip already-materialized sessions.
 *
 * @module activity-materializer
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "activity-materializer" });

// ============================================================================
// Constants
// ============================================================================

// If gap between captures exceeds this, start a new block
const BLOCK_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// App name → category mapping (lowercase keys)
const APP_CATEGORY_MAP: Record<string, string> = {
  "vs code": "development",
  "visual studio code": "development",
  windsurf: "development",
  cursor: "development",
  terminal: "development",
  iterm: "development",
  iterm2: "development",
  warp: "development",
  github: "development",
  gitlab: "development",
  postman: "development",
  chrome: "browsing",
  safari: "browsing",
  firefox: "browsing",
  arc: "browsing",
  "microsoft edge": "browsing",
  "brave browser": "browsing",
  slack: "communication",
  discord: "communication",
  "microsoft teams": "communication",
  zoom: "meeting",
  "google meet": "meeting",
  figma: "design",
  sketch: "design",
  notion: "documentation",
  obsidian: "documentation",
  "microsoft word": "documentation",
  "google docs": "documentation",
  finder: "other",
  explorer: "other",
};

// ============================================================================
// Types
// ============================================================================

interface CaptureForBlock {
  appName: string | null;
  windowTitle: string | null;
  capturedAt: Date;
  activityDescription: string | null;
}

interface MaterializedBlock {
  name: string;
  blockType: "work" | "meeting";
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  description: string;
  apps: string[];
  category: string;
}

// ============================================================================
// Core: materializeSession
// ============================================================================

/**
 * Materialize a single session's captures into activity blocks and daily stats.
 * Called after storyteller completes on session end.
 */
export async function materializeSession(sessionId: string): Promise<void> {
  const startMs = Date.now();

  try {
    // 1. Fetch session metadata
    const [session] = await db
      .select({
        id: schema.monitoringSessions.id,
        userId: schema.monitoringSessions.userId,
        organizationId: schema.monitoringSessions.organizationId,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        name: schema.monitoringSessions.name,
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

    // 3. Fetch all analyzed captures for this session
    const captures = await db
      .select({
        appName: schema.sessionCaptures.appName,
        windowTitle: schema.sessionCaptures.windowTitle,
        capturedAt: schema.sessionCaptures.capturedAt,
        activityDescription: schema.sessionCaptures.activityDescription,
      })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(schema.sessionCaptures.capturedAt);

    // Guard: skip sessions with too few captures (meaningless data)
    const MIN_CAPTURES_FOR_MATERIALIZATION = 3;
    if (captures.length < MIN_CAPTURES_FOR_MATERIALIZATION) {
      logger.info(
        { sessionId, captureCount: captures.length },
        "Too few captures for meaningful materialization, skipping"
      );
      return;
    }

    // 4. Group captures into activity blocks
    const blocks = groupCapturesIntoBlocks(captures, session.name);

    if (blocks.length === 0) {
      // No meaningful blocks — still record the session as processed
      // so we don't re-attempt it, but create a single "untracked" block
      // from the session's start/end times
      const sessionStart = new Date(session.startedAt);
      const sessionEnd = session.endedAt ? new Date(session.endedAt) : new Date();
      const durationMin = Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000);

      blocks.push({
        name: session.name || "Work session",
        blockType: "work",
        startTime: sessionStart,
        endTime: sessionEnd,
        durationMinutes: durationMin,
        description: "Session with no captured screen activity.",
        apps: [],
        category: "other",
      });
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
            sessionId,
            sourceSessionIds: [sessionId],
            sequenceNumber: nextSeq + i,
          }))
        );
      }

      // 8. Recalculate daily aggregate stats from ALL blocks for this day
      await recalculateDailyStats(dailyActivityId, tx);
    });

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
 * Group captures into logical activity blocks based on app changes and time gaps.
 */
function groupCapturesIntoBlocks(
  captures: CaptureForBlock[],
  sessionName: string | null
): MaterializedBlock[] {
  if (captures.length === 0) return [];

  const blocks: MaterializedBlock[] = [];
  let currentGroup: CaptureForBlock[] = [captures[0]!];

  for (let i = 1; i < captures.length; i++) {
    const prev = captures[i - 1]!;
    const curr = captures[i]!;
    const gapMs = curr.capturedAt.getTime() - prev.capturedAt.getTime();
    const appChanged = normalizeApp(curr.appName) !== normalizeApp(prev.appName);

    // Start new block on app change or large time gap
    if (appChanged || gapMs > BLOCK_GAP_THRESHOLD_MS) {
      blocks.push(finalizeBlock(currentGroup, sessionName));
      currentGroup = [curr];
    } else {
      currentGroup.push(curr);
    }
  }

  // Finalize last group
  if (currentGroup.length > 0) {
    blocks.push(finalizeBlock(currentGroup, sessionName));
  }

  return blocks;
}

/**
 * Convert a group of captures into a single MaterializedBlock.
 */
function finalizeBlock(captures: CaptureForBlock[], sessionName: string | null): MaterializedBlock {
  const first = captures[0]!;
  const last = captures[captures.length - 1]!;

  // Collect unique apps
  const appSet = new Set<string>();
  for (const c of captures) {
    if (c.appName) appSet.add(c.appName);
  }
  const apps = Array.from(appSet);
  const primaryApp = apps[0] || "Unknown";

  // Determine category from primary app
  const category = categorizeApp(primaryApp);

  // Determine block type
  const blockType = category === "meeting" ? "meeting" : "work";

  // Build name from activity descriptions or fall back to app name
  const descriptions = captures
    .map((c) => c.activityDescription)
    .filter((d): d is string => !!d && d.trim().length > 0);

  const name = descriptions.length > 0 ? descriptions[0]! : sessionName || `${primaryApp} activity`;

  // Build a brief description from unique activity descriptions
  const uniqueDescriptions = [...new Set(descriptions)];
  const description = uniqueDescriptions.slice(0, 5).join(". ") || name;

  // Duration: from first capture to last capture, minimum 1 minute
  const durationMs = Math.max(last.capturedAt.getTime() - first.capturedAt.getTime(), 60000);
  const durationMinutes = Math.round(durationMs / 60000);

  return {
    name: name.substring(0, 500),
    blockType,
    startTime: first.capturedAt,
    endTime: last.capturedAt,
    durationMinutes,
    description: description.substring(0, 2000),
    apps,
    category,
  };
}

/**
 * Recalculate aggregate stats for a user_daily_activities row
 * from all its activity_blocks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalculateDailyStats(dailyActivityId: string, txOrDb: any = db): Promise<void> {
  // Fetch all blocks for this day
  const blocks = await txOrDb
    .select({
      blockType: schema.activityBlocks.blockType,
      durationMinutes: schema.activityBlocks.durationMinutes,
      apps: schema.activityBlocks.apps,
      category: schema.activityBlocks.category,
      sessionId: schema.activityBlocks.sessionId,
    })
    .from(schema.activityBlocks)
    .where(eq(schema.activityBlocks.dailyActivityId, dailyActivityId));

  let totalWorkMinutes = 0;
  let totalMeetingMinutes = 0;
  const appMinutes: Record<string, number> = {};
  const categoryMinutes: Record<string, number> = {};
  const sessionIds = new Set<string>();

  for (const block of blocks) {
    if (block.blockType === "meeting") {
      totalMeetingMinutes += block.durationMinutes;
    } else {
      totalWorkMinutes += block.durationMinutes;
    }

    if (block.sessionId) sessionIds.add(block.sessionId);

    // App breakdown
    const blockApps = (block.apps as string[]) || [];
    const perAppMinutes = blockApps.length > 0 ? block.durationMinutes / blockApps.length : 0;
    for (const app of blockApps) {
      appMinutes[app] = (appMinutes[app] || 0) + perAppMinutes;
    }

    // Category breakdown
    const cat = (block.category as string) || "other";
    categoryMinutes[cat] = (categoryMinutes[cat] || 0) + block.durationMinutes;
  }

  const totalActiveMinutes = totalWorkMinutes + totalMeetingMinutes;
  const workPercentage = totalActiveMinutes > 0 ? (totalWorkMinutes / totalActiveMinutes) * 100 : 0;
  const meetingPercentage =
    totalActiveMinutes > 0 ? (totalMeetingMinutes / totalActiveMinutes) * 100 : 0;

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

  await txOrDb
    .update(schema.userDailyActivities)
    .set({
      totalWorkMinutes: Math.round(totalWorkMinutes),
      totalMeetingMinutes: Math.round(totalMeetingMinutes),
      totalActiveMinutes: Math.round(totalActiveMinutes),
      totalSessions: sessionIds.size,
      totalCaptures: blocks.length, // one block per capture group
      workPercentage: Math.round(workPercentage * 10) / 10,
      meetingPercentage: Math.round(meetingPercentage * 10) / 10,
      appBreakdown,
      categoryBreakdown,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(schema.userDailyActivities.id, dailyActivityId));
}

/**
 * Normalize app name for comparison.
 */
function normalizeApp(appName: string | null): string {
  if (!appName) return "";
  return appName
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/\.app$/i, "")
    .trim();
}

/**
 * Map an app name to a category.
 */
function categorizeApp(appName: string): string {
  const normalized = normalizeApp(appName);
  return APP_CATEGORY_MAP[normalized] || "other";
}
