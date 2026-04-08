/**
 * Rematerialize Daily Stats for a Single User
 *
 * Re-runs recalculateDailyStats() on user_daily_activities rows for a
 * specific user within a date range. Uses the updated logic that excludes
 * Granola/Fireflies blocks from time calculations.
 *
 * Usage:
 *   npx tsx src/scripts/rematerialize-user-stats.ts --user-id <uuid> [--days 45] [--prod] [--dry-run]
 *
 * Flags:
 *   --user-id <uuid>  Required. The user to rematerialize.
 *   --days <N>        Number of days back to process (default: 45).
 *   --prod            Load .env.production instead of .env.
 *   --dry-run         List rows that would be processed without writing.
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

const isProd = process.argv.includes("--prod");
dotenvConfig({
  path: resolve(process.cwd(), isProd ? ".env.production" : ".env"),
  override: true,
});

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const userId = getArg("--user-id");
const daysBack = parseInt(getArg("--days") || "45", 10);
const dryRun = args.includes("--dry-run");

if (!userId) {
  console.error(
    "Usage: npx tsx src/scripts/rematerialize-user-stats.ts --user-id <uuid> [--days 45] [--prod] [--dry-run]"
  );
  process.exit(1);
}

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema/index");
  const { eq, and, gte } = await import("drizzle-orm");
  const { recalculateDailyStats } = await import("../services/activity-materializer.service");

  console.log("=== Rematerialize User Daily Stats ===");
  console.log(isProd ? "ENV: PRODUCTION" : "ENV: DEVELOPMENT");
  console.log(`User: ${userId}`);
  console.log(`Days back: ${daysBack}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().split("T")[0]!;
  console.log(`Cutoff date: ${cutoffStr}\n`);

  const rows = await db
    .select({
      id: schema.userDailyActivities.id,
      activityDate: schema.userDailyActivities.activityDate,
      totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
      totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
      totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
    })
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.userId, userId!),
        eq(schema.userDailyActivities.periodType, "daily"),
        gte(schema.userDailyActivities.activityDate, cutoffStr)
      )
    )
    .orderBy(schema.userDailyActivities.activityDate);

  console.log(`Found ${rows.length} daily activity rows\n`);

  if (rows.length === 0) {
    console.log("Nothing to process.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("Rows that would be rematerialized:");
    for (const r of rows) {
      console.log(
        `  ${r.activityDate}  work=${r.totalWorkMinutes}m  meeting=${r.totalMeetingMinutes}m  active=${r.totalActiveMinutes}m`
      );
    }
    console.log(`\nDry run complete. ${rows.length} rows. No data written.`);
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const before = {
        work: row.totalWorkMinutes,
        meeting: row.totalMeetingMinutes,
        active: row.totalActiveMinutes,
      };

      await recalculateDailyStats(row.id);

      const [after] = await db
        .select({
          totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
          totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
          totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        })
        .from(schema.userDailyActivities)
        .where(eq(schema.userDailyActivities.id, row.id))
        .limit(1);

      processed++;
      const changed =
        after &&
        (after.totalWorkMinutes !== before.work ||
          after.totalMeetingMinutes !== before.meeting ||
          after.totalActiveMinutes !== before.active);

      console.log(
        `  ${row.activityDate}  ${changed ? "CHANGED" : "unchanged"}` +
          (changed
            ? `  work: ${before.work}m -> ${after!.totalWorkMinutes}m` +
              `  meeting: ${before.meeting}m -> ${after!.totalMeetingMinutes}m` +
              `  active: ${before.active}m -> ${after!.totalActiveMinutes}m`
            : "")
      );
    } catch (error) {
      failed++;
      console.error(
        `  FAILED ${row.activityDate}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log("\n=== Rematerialization Complete ===");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${rows.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
