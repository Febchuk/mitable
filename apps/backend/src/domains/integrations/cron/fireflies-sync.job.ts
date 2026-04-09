/**
 * Fireflies Sync Job
 *
 * Runs every 15 minutes. For each user with Fireflies connected:
 *   1. Fetches recent transcripts via Fireflies GraphQL API
 *   2. Classifies each meeting with Claude Haiku (subscriber + topic)
 *   3. Upserts activity_blocks (blockType: "fireflies")
 *   4. Recalculates daily stats so metrics flow to dashboard + people view
 *
 * Only processes users who have firefliesApiKeyEncrypted set (i.e., integrated).
 */

import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { isNotNull } from "drizzle-orm";
import { firefliesSyncService } from "../fireflies/fireflies-sync.service.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "fireflies-sync-job" });

export async function runFirefliesSyncJob(): Promise<{
  usersProcessed: number;
  usersSkipped: number;
  usersFailed: number;
  totalMeetings: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();

  logger.info("Starting Fireflies sync job");

  // Find all users who have Fireflies integrated (API key is set)
  const integratedUsers = await db
    .select({
      id: schema.users.id,
    })
    .from(schema.users)
    .where(isNotNull(schema.users.firefliesApiKeyEncrypted));

  if (integratedUsers.length === 0) {
    logger.info("No users with Fireflies integration — skipping");
    return {
      usersProcessed: 0,
      usersSkipped: 0,
      usersFailed: 0,
      totalMeetings: 0,
      totalTimeMs: Date.now() - startTime,
    };
  }

  logger.info({ userCount: integratedUsers.length }, "Found users with Fireflies integration");

  let usersProcessed = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  let totalMeetings = 0;

  for (const { id: userId } of integratedUsers) {
    try {
      const result = await firefliesSyncService.syncUserMeetings(userId);

      if (result.meetingsProcessed === 0 && result.errors.length === 0) {
        usersSkipped++;
      } else if (result.errors.length > 0 && result.meetingsProcessed === 0) {
        usersFailed++;
        logger.warn({ userId, errors: result.errors }, "Fireflies sync failed for user");
      } else {
        usersProcessed++;
        totalMeetings += result.meetingsProcessed;
      }
    } catch (error) {
      usersFailed++;
      logger.error({ userId, error: String(error) }, "Fireflies sync job error for user");
    }
  }

  const totalTimeMs = Date.now() - startTime;

  logger.info(
    { usersProcessed, usersSkipped, usersFailed, totalMeetings, totalTimeMs },
    "Fireflies sync job completed"
  );

  return { usersProcessed, usersSkipped, usersFailed, totalMeetings, totalTimeMs };
}
