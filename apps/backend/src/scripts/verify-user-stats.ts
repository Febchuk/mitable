/**
 * Verify User Stats — cross-check user_daily_activities against raw activity_blocks.
 *
 * Usage:
 *   npx tsx src/scripts/verify-user-stats.ts --user-id <uuid> [--days 45] [--prod]
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

if (!userId) {
  console.error(
    "Usage: npx tsx src/scripts/verify-user-stats.ts --user-id <uuid> [--days 45] [--prod]"
  );
  process.exit(1);
}

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema/index");
  const { eq, and, gte } = await import("drizzle-orm");

  console.log("=== Verify User Stats ===");
  console.log(isProd ? "ENV: PRODUCTION" : "ENV: DEVELOPMENT");
  console.log(`User: ${userId}\n`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().split("T")[0]!;

  const dailyRows = await db
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

  for (const day of dailyRows) {
    const blocks = await db
      .select({
        blockType: schema.activityBlocks.blockType,
        name: schema.activityBlocks.name,
        durationMinutes: schema.activityBlocks.durationMinutes,
        startTime: schema.activityBlocks.startTime,
        endTime: schema.activityBlocks.endTime,
      })
      .from(schema.activityBlocks)
      .where(eq(schema.activityBlocks.dailyActivityId, day.id))
      .orderBy(schema.activityBlocks.startTime);

    const workBlocks = blocks.filter((b) => b.blockType === "work");
    const meetingBlocks = blocks.filter((b) => b.blockType === "meeting");
    const granolaBlocks = blocks.filter((b) => b.blockType === "granola");
    const firefliesBlocks = blocks.filter((b) => b.blockType === "fireflies");

    const realWorkMin = workBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    const realMeetingMin = meetingBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    const granolaMin = granolaBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    const firefliesMin = firefliesBlocks.reduce((s, b) => s + b.durationMinutes, 0);
    const expectedActive = realWorkMin + realMeetingMin;

    const match = day.totalActiveMinutes === expectedActive ? "OK" : "MISMATCH";

    console.log(`--- ${day.activityDate} [${match}] ---`);
    console.log(
      `  Stored:  work=${day.totalWorkMinutes}m  meeting=${day.totalMeetingMinutes}m  active=${day.totalActiveMinutes}m`
    );
    console.log(
      `  Blocks:  work=${realWorkMin}m (${workBlocks.length})  meeting=${realMeetingMin}m (${meetingBlocks.length})  expected_active=${expectedActive}m`
    );
    if (granolaBlocks.length > 0) {
      console.log(
        `  Granola: ${granolaMin}m (${granolaBlocks.length} blocks) — EXCLUDED from totals`
      );
      for (const g of granolaBlocks) {
        console.log(`    - ${g.name} (${g.durationMinutes}m)`);
      }
    }
    if (firefliesBlocks.length > 0) {
      console.log(
        `  Fireflies: ${firefliesMin}m (${firefliesBlocks.length} blocks) — EXCLUDED from totals`
      );
      for (const f of firefliesBlocks) {
        console.log(`    - ${f.name} (${f.durationMinutes}m)`);
      }
    }
    if (match !== "OK") {
      console.log(
        `  ** MISMATCH: stored active=${day.totalActiveMinutes} vs expected=${expectedActive}`
      );
    }
    console.log();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
