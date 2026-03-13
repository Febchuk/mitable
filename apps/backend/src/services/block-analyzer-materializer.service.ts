/**
 * Block Analyzer Materializer
 *
 * Takes the output of the Block Analyzer RLM and writes it to the database:
 *   1. Upserts user_daily_activities row for the session's date
 *   2. Inserts activity_blocks from RLM-emitted blocks
 *   3. Recalculates daily aggregate stats from ALL blocks for that day
 *   4. Fire-and-forget: incremental graph sync + customer auto-discovery
 *
 * Replaces the old activity-materializer.service.ts which relied on
 * the lightweight classifySession → keyActivities pipeline.
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { syncSubscriberToGraph, syncTopicToGraph } from "./graph/graph-incremental-sync.service.js";
import { addDiscoveredCustomers } from "./known-customers.service";
import { recalculateDailyStats } from "./activity-materializer.service";
import type { BlockAnalyzerResult } from "./rlm/block-analyzer-rlm.service";
import type { EmittedBlock } from "./rlm/block-analyzer-environment";

const logger = createLogger({ context: "block-analyzer-materializer" });

/**
 * Materialize Block Analyzer RLM output into the database.
 *
 * Writes activity_blocks + recalculates user_daily_activities.
 * Idempotent: checks processedSessionIds to skip already-materialized sessions.
 */
export async function materializeBlockAnalyzerResult(
  sessionId: string,
  userId: string,
  organizationId: string,
  sessionStartedAt: Date,
  result: BlockAnalyzerResult
): Promise<void> {
  const startMs = Date.now();

  try {
    const activityDate = sessionStartedAt.toISOString().split("T")[0]!;

    // 1. Idempotency check
    const [existingDay] = await db
      .select({
        id: schema.userDailyActivities.id,
        processedSessionIds: schema.userDailyActivities.processedSessionIds,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, userId),
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

    const blocks = result.blocks;
    if (blocks.length === 0) {
      logger.warn({ sessionId }, "Block Analyzer produced no blocks — skipping materialization");
      return;
    }

    // 2. Upsert daily activity + insert blocks in a transaction
    const dailyActivityId = existingDay?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Upsert daily activity row
      if (!existingDay) {
        await tx.insert(schema.userDailyActivities).values({
          id: dailyActivityId,
          userId,
          organizationId,
          activityDate,
          periodType: "daily",
          processedSessionIds: [sessionId],
          status: "completed",
          modelUsed: result.modelUsed,
          processingTimeMs: result.executionTimeMs,
          lastProcessedAt: new Date(),
        });
      } else {
        await tx
          .update(schema.userDailyActivities)
          .set({
            processedSessionIds: [...processedIds, sessionId],
            modelUsed: result.modelUsed,
            processingTimeMs: result.executionTimeMs,
            lastProcessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.userDailyActivities.id, dailyActivityId));
      }

      // Get current max sequence number for this day
      const [{ maxSeq }] = await tx
        .select({
          maxSeq: sql<number>`coalesce(max(${schema.activityBlocks.sequenceNumber}), -1)`,
        })
        .from(schema.activityBlocks)
        .where(eq(schema.activityBlocks.dailyActivityId, dailyActivityId));

      const nextSeq = (maxSeq ?? -1) + 1;

      // Batch insert activity blocks
      await tx.insert(schema.activityBlocks).values(
        blocks.map((block: EmittedBlock, i: number) => ({
          dailyActivityId,
          userId,
          blockType: block.type,
          name: block.name,
          startTime: block.startTime,
          endTime: block.endTime,
          durationMinutes: block.durationMinutes,
          description: block.description,
          apps: block.apps,
          category: block.category,
          participants: block.participants || [],
          topicName: block.topicName || null,
          subscriberName: block.subscriberName || null,
          sessionId,
          sourceSessionIds: block.sourceSessionIds,
          sequenceNumber: nextSeq + i,
        }))
      );

      // Recalculate daily aggregate stats from ALL blocks for this day
      await recalculateDailyStats(dailyActivityId, tx);
    });

    // 3. Fire-and-forget: idempotent graph sync from SQL aggregates + customer discovery
    const personKey = Buffer.from(`${organizationId}:${userId}`).toString("base64");

    // Compute user-level subscriber totals from SQL (not per-block — idempotent)
    const subscriberTotals = await db
      .select({
        subscriberName: schema.activityBlocks.subscriberName,
        totalMinutes: sql<number>`sum(${schema.activityBlocks.durationMinutes})::int`,
        blockCount: sql<number>`count(*)::int`,
      })
      .from(schema.activityBlocks)
      .where(eq(schema.activityBlocks.userId, userId))
      .groupBy(schema.activityBlocks.subscriberName);

    for (const row of subscriberTotals) {
      if (row.subscriberName) {
        syncSubscriberToGraph(
          organizationId,
          row.subscriberName,
          personKey,
          row.totalMinutes,
          row.blockCount
        ).catch((err) =>
          logger.warn({ err: String(err) }, "Graph subscriber sync failed (non-fatal)")
        );
      }
    }

    // Compute user-level topic totals from SQL (idempotent)
    const topicTotals = await db
      .select({
        topicName: schema.activityBlocks.topicName,
        category: sql<string>`mode() WITHIN GROUP (ORDER BY ${schema.activityBlocks.category})`,
        totalMinutes: sql<number>`sum(${schema.activityBlocks.durationMinutes})::int`,
        blockCount: sql<number>`count(*)::int`,
      })
      .from(schema.activityBlocks)
      .where(eq(schema.activityBlocks.userId, userId))
      .groupBy(schema.activityBlocks.topicName);

    for (const row of topicTotals) {
      if (row.topicName) {
        syncTopicToGraph(
          organizationId,
          row.topicName,
          personKey,
          row.category,
          row.totalMinutes,
          row.blockCount
        ).catch((err) => logger.warn({ err: String(err) }, "Graph topic sync failed (non-fatal)"));
      }
    }

    // Auto-discover new customers from block output
    const newSubscribers = blocks
      .map((b: EmittedBlock) => b.subscriberName)
      .filter((s): s is string => !!s);
    if (newSubscribers.length > 0) {
      addDiscoveredCustomers(organizationId, newSubscribers).catch((err) =>
        logger.warn({ err: String(err) }, "Failed to persist discovered customers")
      );
    }

    const elapsed = Date.now() - startMs;
    logger.info(
      {
        sessionId,
        activityDate,
        blockCount: blocks.length,
        workMinutes: result.totalWorkMinutes,
        meetingMinutes: result.totalMeetingMinutes,
        elapsedMs: elapsed,
      },
      "Block Analyzer results materialized"
    );
  } catch (error) {
    logger.error(
      {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Block Analyzer materialization failed"
    );
  }
}
