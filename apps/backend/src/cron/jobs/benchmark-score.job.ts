/**
 * Benchmark Score Computation Job
 *
 * Computes scores for all active benchmarks across all organizations.
 * Runs nightly at 02:30 UTC after activity data has settled.
 *
 * For each active benchmark:
 *   1. Gathers activity data for the scoring period (weekly/monthly/quarterly)
 *   2. AI scores each parameter 1-5
 *   3. Calculates weighted score → 0-100 progress
 *   4. Updates percentiles, trends, snapshots, suggestions, accomplishments
 */

import { db } from "../../db/client.js";
import { benchmarks } from "../../db/schema/benchmarks.schema.js";
import { eq } from "drizzle-orm";
import { benchmarkComputeService } from "../../services/benchmark-compute.service.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ context: "benchmark-score-job" });

export async function runBenchmarkScoreJob(): Promise<{
  benchmarksProcessed: number;
  benchmarksFailed: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    // Fetch all active benchmarks across all orgs
    const activeBenchmarks = await db
      .select({
        id: benchmarks.id,
        name: benchmarks.name,
        organizationId: benchmarks.organizationId,
      })
      .from(benchmarks)
      .where(eq(benchmarks.isActive, true));

    if (activeBenchmarks.length === 0) {
      logger.info("No active benchmarks to compute");
      return { benchmarksProcessed: 0, benchmarksFailed: 0, totalTimeMs: Date.now() - startTime };
    }

    logger.info({ count: activeBenchmarks.length }, "Starting benchmark score computation");

    // Process each benchmark sequentially to avoid overwhelming the LLM
    for (const bm of activeBenchmarks) {
      try {
        await benchmarkComputeService.computeScores(bm.id, bm.organizationId);
        processed++;
        logger.info({ benchmarkId: bm.id, name: bm.name }, "Benchmark scores computed");
      } catch (error) {
        failed++;
        logger.error(
          { err: error, benchmarkId: bm.id, name: bm.name },
          "Failed to compute benchmark scores"
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Benchmark score job failed");
  }

  const totalTimeMs = Date.now() - startTime;
  logger.info(
    { processed, failed, totalTimeMs },
    "Benchmark score job completed"
  );

  return { benchmarksProcessed: processed, benchmarksFailed: failed, totalTimeMs };
}
