/**
 * Granola Sync Job
 *
 * Runs every 15 minutes. For each user with Granola connected:
 *   1. Fetches recent meetings via Granola MCP
 *   2. Classifies each meeting with Claude Haiku (subscriber + topic)
 *   3. Upserts activity_blocks (blockType: "granola")
 *   4. Recalculates daily stats so metrics flow to dashboard + people view
 *
 * Only processes users who have granolaAccessTokenEncrypted set (i.e., integrated).
 */

import { db } from "../../../db/client";
import * as schema from "../../../db/schema/index";
import { isNotNull } from "drizzle-orm";
import { granolaSyncService } from "../granola/granola-sync.service";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "granola-sync-job" });

export async function runGranolaSyncJob(): Promise<{
  usersProcessed: number;
  usersSkipped: number;
  usersFailed: number;
  totalMeetings: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();

  logger.info("Starting Granola sync job");

  // Find all users who have Granola integrated (access token is set)
  const integratedUsers = await db
    .select({
      id: schema.users.id,
    })
    .from(schema.users)
    .where(isNotNull(schema.users.granolaAccessTokenEncrypted));

  if (integratedUsers.length === 0) {
    logger.info("No users with Granola integration — skipping");
    return {
      usersProcessed: 0,
      usersSkipped: 0,
      usersFailed: 0,
      totalMeetings: 0,
      totalTimeMs: Date.now() - startTime,
    };
  }

  logger.info({ userCount: integratedUsers.length }, "Found users with Granola integration");

  let usersProcessed = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  let totalMeetings = 0;

  for (const { id: userId } of integratedUsers) {
    try {
      const result = await granolaSyncService.syncUserMeetings(userId);

      if (result.meetingsProcessed === 0 && result.errors.length === 0) {
        usersSkipped++;
      } else if (result.errors.length > 0 && result.meetingsProcessed === 0) {
        usersFailed++;
        logger.warn({ userId, errors: result.errors }, "Granola sync failed for user");
      } else {
        usersProcessed++;
        totalMeetings += result.meetingsProcessed;
      }
    } catch (error) {
      usersFailed++;
      logger.error({ userId, error: String(error) }, "Granola sync job error for user");
    }
  }

  const totalTimeMs = Date.now() - startTime;

  logger.info(
    { usersProcessed, usersSkipped, usersFailed, totalMeetings, totalTimeMs },
    "Granola sync job completed"
  );

  return { usersProcessed, usersSkipped, usersFailed, totalMeetings, totalTimeMs };
}
