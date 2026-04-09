/**
 * Rematerialize Daily Stats
 *
 * Re-runs recalculateDailyStats() on all user_daily_activities rows so that
 * the new normalizeName() logic deduplicates subscriber/topic breakdowns
 * on historical data.
 *
 * Usage:
 *   npx tsx src/scripts/rematerialize-daily-stats.ts [--org <orgId>] [--dry-run]
 *
 * Flags:
 *   --org <orgId>   Only process rows for a specific organization
 *   --dry-run       Count rows that would be processed without writing
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq } from "drizzle-orm";
import { recalculateDailyStats } from "../domains/sessions/services/activity-materializer.service";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orgIdx = args.indexOf("--org");
  const orgId = orgIdx !== -1 ? args[orgIdx + 1] : undefined;

  console.log("=== Rematerialize Daily Stats (normalize subscriber/topic names) ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (orgId) console.log(`Org filter: ${orgId}`);

  // Fetch all daily activity rows (optionally filtered by org)
  const query = db
    .select({
      id: schema.userDailyActivities.id,
      userId: schema.userDailyActivities.userId,
      organizationId: schema.userDailyActivities.organizationId,
      activityDate: schema.userDailyActivities.activityDate,
    })
    .from(schema.userDailyActivities);

  const rows = orgId
    ? await query.where(eq(schema.userDailyActivities.organizationId, orgId))
    : await query;

  console.log(`Found ${rows.length} user_daily_activities rows to process`);

  if (dryRun) {
    const byOrg = new Map<string, number>();
    for (const r of rows) {
      byOrg.set(r.organizationId, (byOrg.get(r.organizationId) || 0) + 1);
    }
    console.log("\nRows by org:");
    for (const [org, count] of byOrg) {
      console.log(`  ${org}: ${count} rows`);
    }
    console.log("\nDry run complete. No data written.");
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await recalculateDailyStats(row.id);
      processed++;

      if (processed % 50 === 0) {
        console.log(`  Progress: ${processed}/${rows.length} processed, ${failed} failed`);
      }
    } catch (error) {
      failed++;
      console.error(
        `  Failed row ${row.id} (user=${row.userId}, date=${row.activityDate}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("\n=== Rematerialization Complete ===");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${rows.length}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Rematerialization failed:", error);
  process.exit(1);
});
