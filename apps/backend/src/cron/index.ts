/**
 * Cron Scheduler
 *
 * Runs inside the backend process — shares DB, config, and services.
 *
 * Data pipeline: The session materializer (activity-materializer.service)
 * handles all data gathering on session end. Cron only handles cleanup.
 *
 * Schedule:
 *   - Stale Session Cleanup: Every 15 minutes — auto-ends abandoned sessions
 */

import cron from "node-cron";
import { cleanupStaleSessions } from "../services/stale-session-cleanup.service";
import { createLogger } from "../lib/logger";
import { runGraphSyncJob } from "./jobs/graph-sync.job";
import { runGranolaSyncJob } from "./jobs/granola-sync.job";
import { runFirefliesSyncJob } from "./jobs/fireflies-sync.job";
import { config } from "../config";

const logger = createLogger({ context: "cron-scheduler" });

let isStaleCleanupRunning = false;

/**
 * Initialize all cron jobs.
 * Call this once during backend startup.
 */
export function initCronJobs(): void {
  logger.info("Initializing cron scheduler");

  // ──────────────────────────────────────────────
  // Stale Session Cleanup: Every 15 minutes (at :05, :20, :35, :50)
  // Finds sessions still marked 'active'/'paused' with no recent captures
  // (>30 min gap) or exceeding 12 hours. Auto-ends them at last capture
  // timestamp and runs the activity materializer.
  // ──────────────────────────────────────────────
  cron.schedule("5,20,35,50 * * * *", async () => {
    if (isStaleCleanupRunning) {
      logger.warn("Stale session cleanup still running — skipping");
      return;
    }

    isStaleCleanupRunning = true;

    try {
      const result = await cleanupStaleSessions();
      if (result.sessionsEnded > 0) {
        logger.info(
          { ended: result.sessionsEnded, failed: result.sessionsFailed },
          "Stale session cleanup completed"
        );
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Stale session cleanup failed");
    } finally {
      isStaleCleanupRunning = false;
    }
  });

  // ──────────────────────────────────────────────
  // Granola Sync: Every 15 minutes (at :10, :25, :40, :55)
  // Fetches Granola meetings for integrated users, classifies with
  // Claude Haiku, and upserts activity_blocks + daily stats.
  // ──────────────────────────────────────────────
  let isGranolaSyncRunning = false;

  cron.schedule("10,25,40,55 * * * *", async () => {
    if (isGranolaSyncRunning) {
      logger.warn("Granola sync still running — skipping");
      return;
    }

    isGranolaSyncRunning = true;
    try {
      await runGranolaSyncJob();
    } catch (error) {
      logger.error({ error: String(error) }, "Granola sync job failed");
    } finally {
      isGranolaSyncRunning = false;
    }
  });

  // ──────────────────────────────────────────────
  // Graph Sync: Nightly at 02:15
  // Extracts recent activity and refreshes graph intelligence views.
  // ──────────────────────────────────────────────
  if (config.graph.enabled) {
    cron.schedule("15 2 * * *", async () => {
      await runGraphSyncJob();
    });
    logger.info("Graph sync scheduled — daily at 02:15");
  } else {
    logger.info("Graph sync disabled (GRAPH_ENABLED=false)");
  }

  // ──────────────────────────────────────────────
  // Fireflies Sync: Every 15 minutes (at :12, :27, :42, :57)
  // Fetches recent transcripts for connected users, classifies
  // with Haiku, and upserts activity_blocks (blockType: "fireflies").
  // ──────────────────────────────────────────────
  let isFirefliesSyncRunning = false;
  cron.schedule("12,27,42,57 * * * *", async () => {
    if (isFirefliesSyncRunning) {
      logger.warn("Fireflies sync still running — skipping");
      return;
    }

    isFirefliesSyncRunning = true;

    try {
      const result = await runFirefliesSyncJob();
      if (result.usersProcessed > 0 || result.usersFailed > 0) {
        logger.info(
          {
            processed: result.usersProcessed,
            skipped: result.usersSkipped,
            failed: result.usersFailed,
            meetings: result.totalMeetings,
            timeMs: result.totalTimeMs,
          },
          "Fireflies sync completed",
        );
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Fireflies sync job failed");
    } finally {
      isFirefliesSyncRunning = false;
    }
  });

  logger.info("Cron scheduler initialized — Stale cleanup every 15min, Granola sync every 15min, Fireflies sync every 15min");
}
