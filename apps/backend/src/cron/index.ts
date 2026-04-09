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
import { createLogger } from "../domains/shared-infra/lib/logger.js";
import { runGraphSyncJob } from "./jobs/graph-sync.job";
import { runGranolaSyncJob } from "./jobs/granola-sync.job";
import { runFirefliesSyncJob } from "./jobs/fireflies-sync.job";
import { runBenchmarkScoreJob } from "../domains/benchmarks/cron/benchmark-score.job";
import { runBragbookGenerateJob } from "../domains/updates/cron/bragbook-generate.job";
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
          "Fireflies sync completed"
        );
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Fireflies sync job failed");
    } finally {
      isFirefliesSyncRunning = false;
    }
  });

  // ──────────────────────────────────────────────
  // Benchmark Score Computation
  // Frequency-matched scheduling:
  //   daily      → every night at 02:30 UTC
  //   weekly     → Mondays at 02:30 UTC
  //   monthly    → 1st of month at 02:30 UTC
  //   quarterly  → 1st of Jan/Apr/Jul/Oct at 02:30 UTC
  // ──────────────────────────────────────────────
  let isBenchmarkScoreRunning = false;

  const runBenchmarks = async (frequencies: string[], label: string) => {
    if (isBenchmarkScoreRunning) {
      logger.warn({ label }, "Benchmark score job still running — skipping");
      return;
    }

    isBenchmarkScoreRunning = true;
    try {
      const result = await runBenchmarkScoreJob(frequencies);
      if (result.benchmarksProcessed > 0 || result.benchmarksFailed > 0) {
        logger.info(
          {
            label,
            processed: result.benchmarksProcessed,
            failed: result.benchmarksFailed,
            timeMs: result.totalTimeMs,
          },
          "Benchmark score job completed"
        );
      }
    } catch (error) {
      logger.error({ error: String(error), label }, "Benchmark score job failed");
    } finally {
      isBenchmarkScoreRunning = false;
    }
  };

  // Daily benchmarks — every night at 02:30
  cron.schedule("30 2 * * *", () => runBenchmarks(["daily"], "daily"));

  // Weekly benchmarks — Mondays at 02:30
  cron.schedule("30 2 * * 1", () => runBenchmarks(["weekly"], "weekly"));

  // Monthly benchmarks — 1st of each month at 02:30
  cron.schedule("30 2 1 * *", () => runBenchmarks(["monthly"], "monthly"));

  // Quarterly benchmarks — 1st of Jan, Apr, Jul, Oct at 02:30
  cron.schedule("30 2 1 1,4,7,10 *", () => runBenchmarks(["quarterly"], "quarterly"));

  // ──────────────────────────────────────────────
  // Bragbook Generation
  // AI-polished accomplishment summaries per period.
  // Runs after benchmarks to let activity data settle.
  //   weekly     → Mondays at 03:00 UTC
  //   monthly    → 1st of month at 03:00 UTC
  //   quarterly  → 1st of Jan/Apr/Jul/Oct at 03:00 UTC
  // ──────────────────────────────────────────────
  let isBragbookGenerateRunning = false;

  const runBragbook = async (
    periodTypes: Array<"weekly" | "monthly" | "quarterly">,
    label: string
  ) => {
    if (isBragbookGenerateRunning) {
      logger.warn({ label }, "Bragbook generate job still running — skipping");
      return;
    }

    isBragbookGenerateRunning = true;
    try {
      const result = await runBragbookGenerateJob(periodTypes);
      if (result.usersProcessed > 0 || result.usersFailed > 0) {
        logger.info(
          {
            label,
            processed: result.usersProcessed,
            skipped: result.usersSkipped,
            failed: result.usersFailed,
            timeMs: result.totalTimeMs,
          },
          "Bragbook generate job completed"
        );
      }
    } catch (error) {
      logger.error({ error: String(error), label }, "Bragbook generate job failed");
    } finally {
      isBragbookGenerateRunning = false;
    }
  };

  // Weekly bragbook — Mondays at 03:00
  cron.schedule("0 3 * * 1", () => runBragbook(["weekly"], "weekly"));

  // Monthly bragbook — 1st of each month at 03:00
  cron.schedule("0 3 1 * *", () => runBragbook(["monthly"], "monthly"));

  // Quarterly bragbook — 1st of Jan, Apr, Jul, Oct at 03:00
  cron.schedule("0 3 1 1,4,7,10 *", () => runBragbook(["quarterly"], "quarterly"));

  logger.info(
    "Cron scheduler initialized — Stale cleanup every 15min, Granola sync every 15min, Fireflies sync every 15min, Benchmarks: daily/weekly/monthly/quarterly, Bragbook: weekly/monthly/quarterly"
  );
}
