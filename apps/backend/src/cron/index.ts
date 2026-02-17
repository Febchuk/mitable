/**
 * Cron Scheduler
 *
 * Manages periodic jobs for the admin dashboard data pipeline.
 * Runs inside the backend process — shares DB, config, and services.
 *
 * Schedule:
 *   - Layer 1 (User Rollup):      Every 30 minutes — Day Analyzer RLM per user
 *   - Layer 2 (Org Rollup):        Every 30 minutes — Org-wide aggregation (after Layer 1)
 *   - Layer 3 (Period Snapshots):   Daily at midnight — Weekly/monthly consolidation
 */

import cron from "node-cron";
import { runUserRollup } from "./jobs/user-rollup.job";
import { runOrgRollup } from "./jobs/org-rollup.job";
import { runPeriodSnapshots } from "./jobs/period-snapshot.job";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "cron-scheduler" });

let isLayer1Running = false;
let isLayer2Running = false;
let isLayer3Running = false;

/**
 * Initialize all cron jobs.
 * Call this once during backend startup.
 */
export function initCronJobs(): void {
  logger.info("Initializing cron scheduler");

  // ──────────────────────────────────────────────
  // Layer 1 + 2: Every 30 minutes (at :00 and :30)
  // Layer 1 runs first, then Layer 2 reads its output
  // ──────────────────────────────────────────────
  cron.schedule("0,30 * * * *", async () => {
    if (isLayer1Running) {
      logger.warn("Layer 1 (user rollup) still running from previous cycle — skipping");
      return;
    }

    isLayer1Running = true;

    try {
      // Layer 1: Per-user day analysis
      const layer1Result = await runUserRollup();
      logger.info(
        {
          usersProcessed: layer1Result.usersProcessed,
          usersSkipped: layer1Result.usersSkipped,
          usersFailed: layer1Result.usersFailed,
          timeMs: layer1Result.totalTimeMs,
        },
        "Layer 1 completed — starting Layer 2"
      );

      // Layer 2: Org-wide aggregation (depends on Layer 1)
      if (isLayer2Running) {
        logger.warn("Layer 2 (org rollup) still running — skipping");
      } else {
        isLayer2Running = true;
        try {
          const layer2Result = await runOrgRollup();
          logger.info(
            {
              orgsProcessed: layer2Result.orgsProcessed,
              timeMs: layer2Result.totalTimeMs,
            },
            "Layer 2 completed"
          );
        } catch (error) {
          logger.error({ error: String(error) }, "Layer 2 (org rollup) failed");
        } finally {
          isLayer2Running = false;
        }
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Layer 1 (user rollup) failed");
    } finally {
      isLayer1Running = false;
    }
  });

  // ──────────────────────────────────────────────
  // Layer 3: Daily at midnight (00:05 to avoid overlap with :00 Layer 1/2)
  // Consolidates daily data into weekly and monthly snapshots
  // ──────────────────────────────────────────────
  cron.schedule("5 0 * * *", async () => {
    if (isLayer3Running) {
      logger.warn("Layer 3 (period snapshots) still running — skipping");
      return;
    }

    isLayer3Running = true;

    try {
      const result = await runPeriodSnapshots();
      logger.info(
        {
          weeklySnapshots: result.weeklySnapshots,
          monthlySnapshots: result.monthlySnapshots,
          timeMs: result.totalTimeMs,
        },
        "Layer 3 completed"
      );
    } catch (error) {
      logger.error({ error: String(error) }, "Layer 3 (period snapshots) failed");
    } finally {
      isLayer3Running = false;
    }
  });

  logger.info("Cron scheduler initialized — Layer 1+2 every 30min, Layer 3 at 00:05 daily");
}
