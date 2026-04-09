#!/usr/bin/env npx tsx
/**
 * Backfill Benchmark Scores
 *
 * Runs the benchmark scoring pipeline for all active benchmarks, or a specific one.
 * Uses real activity data from userDailyActivities + activityBlocks.
 *
 * Usage:
 *   cd apps/backend
 *   npx tsx src/scripts/backfill-benchmarks.ts                     # All active benchmarks
 *   npx tsx src/scripts/backfill-benchmarks.ts --id <benchmark-id> # Specific benchmark
 *   npx tsx src/scripts/backfill-benchmarks.ts --org <org-id>      # All benchmarks in an org
 *   npx tsx src/scripts/backfill-benchmarks.ts --dry-run            # Show what would be computed
 */

import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { benchmarkComputeService } from "../domains/benchmarks/services/benchmark-compute.service.js";

// Parse CLI args
const args = process.argv.slice(2);
const idFlag = args.indexOf("--id");
const orgFlag = args.indexOf("--org");
const dryRun = args.includes("--dry-run");
const specificId = idFlag >= 0 ? args[idFlag + 1] : null;
const specificOrg = orgFlag >= 0 ? args[orgFlag + 1] : null;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool, { schema });

  console.log("📊 Benchmark Score Backfill");
  console.log("─".repeat(50));

  // Build query conditions
  const conditions = [eq(schema.benchmarks.isActive, true)];
  if (specificId) conditions.push(eq(schema.benchmarks.id, specificId));
  if (specificOrg) conditions.push(eq(schema.benchmarks.organizationId, specificOrg));

  const activeBenchmarks = await db
    .select({
      id: schema.benchmarks.id,
      name: schema.benchmarks.name,
      organizationId: schema.benchmarks.organizationId,
      frequency: schema.benchmarks.frequency,
    })
    .from(schema.benchmarks)
    .where(and(...conditions));

  if (activeBenchmarks.length === 0) {
    console.log("No matching benchmarks found.");
    await pool.end();
    process.exit(0);
  }

  console.log(`Found ${activeBenchmarks.length} benchmark(s) to process:\n`);

  for (const bm of activeBenchmarks) {
    // Count assignments
    const assignments = await db
      .select({ id: schema.benchmarkAssignments.id })
      .from(schema.benchmarkAssignments)
      .where(eq(schema.benchmarkAssignments.benchmarkId, bm.id));

    console.log(`  ${bm.name} (${bm.frequency}) — ${assignments.length} assignments`);
  }

  if (dryRun) {
    console.log("\n🔍 Dry run — no scores computed.");
    await pool.end();
    process.exit(0);
  }

  console.log("\n⏳ Computing scores...\n");

  let processed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const bm of activeBenchmarks) {
    const bmStart = Date.now();
    try {
      await benchmarkComputeService.computeScores(bm.id, bm.organizationId);
      const elapsed = Date.now() - bmStart;
      processed++;
      console.log(`  ✅ ${bm.name} — computed in ${elapsed}ms`);
    } catch (error) {
      failed++;
      console.error(`  ❌ ${bm.name} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const totalTime = Date.now() - startTime;

  console.log("\n" + "─".repeat(50));
  console.log(`✅ Done: ${processed} computed, ${failed} failed (${totalTime}ms)`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
