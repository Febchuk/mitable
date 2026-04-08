/**
 * Rematerialize Daily Stats for ALL users in an organization.
 *
 * Fetches all user IDs for the org, then runs recalculateDailyStats()
 * on every user_daily_activities row within the date range.
 *
 * Usage:
 *   npx tsx src/scripts/rematerialize-org.ts --org-id <uuid> [--days 45] [--prod] [--dry-run]
 *
 * If --org-id is omitted, lists all orgs so you can pick one.
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

const orgId = getArg("--org-id");
const daysBack = parseInt(getArg("--days") || "45", 10);
const dryRun = args.includes("--dry-run");

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema/index");
  const { eq, and, gte } = await import("drizzle-orm");
  const { recalculateDailyStats } = await import("../services/activity-materializer.service");

  // If no org-id, list all orgs
  if (!orgId) {
    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
      })
      .from(schema.organizations);

    console.log("Available organizations:");
    for (const org of orgs) {
      const userCount = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.organizationId, org.id));
      console.log(`  ${org.id}  ${org.name}  (${userCount.length} users)`);
    }
    console.log("\nRe-run with --org-id <uuid>");
    process.exit(0);
  }

  // Get all users in the org
  const users = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.organizationId, orgId));

  console.log("=== Rematerialize Org Daily Stats ===");
  console.log(isProd ? "ENV: PRODUCTION" : "ENV: DEVELOPMENT");
  console.log(`Org: ${orgId}`);
  console.log(`Users: ${users.length}`);
  console.log(`Days back: ${daysBack}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().split("T")[0]!;

  let totalProcessed = 0;
  let totalChanged = 0;
  let totalFailed = 0;

  for (const user of users) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    console.log(`\n── ${name} (${user.id}) ──`);

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
          eq(schema.userDailyActivities.userId, user.id),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, cutoffStr)
        )
      )
      .orderBy(schema.userDailyActivities.activityDate);

    console.log(`  ${rows.length} daily activity rows`);

    if (rows.length === 0) continue;

    if (dryRun) {
      for (const r of rows) {
        console.log(
          `  ${r.activityDate}  work=${r.totalWorkMinutes}m  meeting=${r.totalMeetingMinutes}m  active=${r.totalActiveMinutes}m`
        );
      }
      totalProcessed += rows.length;
      continue;
    }

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

        totalProcessed++;
        const changed =
          after &&
          (after.totalWorkMinutes !== before.work ||
            after.totalMeetingMinutes !== before.meeting ||
            after.totalActiveMinutes !== before.active);

        if (changed) {
          totalChanged++;
          console.log(
            `  ${row.activityDate}  CHANGED` +
              `  work: ${before.work}m → ${after!.totalWorkMinutes}m` +
              `  meeting: ${before.meeting}m → ${after!.totalMeetingMinutes}m` +
              `  active: ${before.active}m → ${after!.totalActiveMinutes}m`
          );
        }
      } catch (error) {
        totalFailed++;
        console.error(
          `  FAILED ${row.activityDate}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  console.log("\n=== Rematerialization Complete ===");
  console.log(`Users: ${users.length}`);
  console.log(`Rows processed: ${totalProcessed}`);
  console.log(`Rows changed: ${totalChanged}`);
  console.log(`Rows failed: ${totalFailed}`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
